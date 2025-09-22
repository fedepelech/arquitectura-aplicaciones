// Importar handlers de los MCP proxies
const closeShiftsHandler = require('./close-shifts-proxy/app').handler;
const closureHandler = require('./closure-proxy/app').handler;
const logsHandler = require('./logs-proxy/app').handler;
const processTransactionsHandler = require('./process-transactions-proxy/app').handler;
const salesHandler = require('./sales-proxy/app').handler;
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
const monolitoUrl = process.env.MONOLITO_URL || 'http://localhost:3000';
// Configuración LLM por defecto (modelo rápido y ligero)
const DEFAULT_LLM_MODEL = process.env.LLM_MODEL || 'llama3.2:3b-instruct-q4_K_M';
const DEFAULT_KEEP_ALIVE = process.env.LLM_KEEP_ALIVE || '1h';
const DEFAULT_NUM_PREDICT = parseInt(process.env.LLM_NUM_PREDICT || '512', 10);
const DEFAULT_NUM_THREAD = process.env.LLM_NUM_THREAD ? parseInt(process.env.LLM_NUM_THREAD, 10) : undefined;

const app = express();

// Middlewares
app.use(cors({
  origin: 'http://localhost:3001',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json()); 
app.options('*', cors());

// --- Intent detection for action tools from natural language prompts ---
function detectActionFromPrompt(promptRaw) {
  if (!promptRaw) return null;
  const p = String(promptRaw).toLowerCase();
  const hasDia = p.includes('día') || p.includes('dia') || p.includes('jornada');
  const wantsClose = p.includes('cerrar') || p.includes('cierre');
  const hasForce = p.includes('forzar') || p.includes('forzado') || p.includes('force');
  const hasTrans = p.includes('transaccion') || p.includes('transacción') || p.includes('transacciones');
  const hasProcesar = p.includes('procesar') || p.includes('procesamiento');
  const hasTurnos = p.includes('turno') || p.includes('turnos');
  const hasLogs = p.includes('log') || p.includes('logs');
  const hasVentas = p.includes('venta') || p.includes('ventas');
  const hasEstado = p.includes('estado');
  const asksWhy = p.includes('por qué') || p.includes('porque') || p.includes('por que');

  if (hasProcesar && hasTrans) {
    return { tool: 'process_pending_transactions', payload: { businessDay: 'today' } };
  }
  if (hasTurnos && wantsClose) {
    return { tool: 'force_close_shifts', payload: { businessDay: 'today' } };
  }
  if (hasLogs) {
    return { tool: 'read_local_logs', payload: { lines: 50 } };
  }
  if (hasVentas) {
    return { tool: 'get_sales_data', payload: { businessDay: 'today' } };
  }
  if (hasEstado && hasDia) {
    return { tool: 'get_business_day_status', payload: { date: 'today' } };
  }
  if (asksWhy && wantsClose && hasDia) {
    return { tool: 'check_closure_status', payload: { businessDay: 'today' } };
  }
  if (wantsClose && hasDia) {
    return { tool: 'close_business_day', payload: { date: 'today', forceClosure: !!hasForce } };
  }
  return null;
}

// Helper: genera un resumen de negocio con el LLM a partir de los datos crudos de la tool
async function summarizeWithLLM({ tool, data, userPrompt = '', model = DEFAULT_LLM_MODEL, originTool = null }) {
  // Prepara un prompt claro y no técnico, orientado al gerente
  const toolLabelMap = {
    'check_closure_status': 'Estado de cierre del día',
    'get_sales_data': 'Resumen de ventas',
    'read_local_logs': 'Últimos registros del sistema',
    'process_pending_transactions': 'Procesamiento de transacciones pendientes',
    'force_close_shifts': 'Cierre forzado de turnos',
    'get_business_day_status': 'Estado del día de negocio',
    'close_business_day': 'Cierre del día de negocio',
    'llm': 'Asistente IA'
  };

  const effectiveTool = tool === 'llm' && originTool ? originTool : tool;
  const label = toolLabelMap[effectiveTool] || 'Operación del sistema';

  const llmPrompt = `Rol: Asistente de Operaciones para un Gerente de Restaurante.
Objetivo: traducir información técnica en un resumen claro en español, con enfoque de negocio.
Instrucciones:
- Evita jerga técnica. Habla con claridad y precisión.
- Extensión máxima: 250-300 palabras.
- Estructura la respuesta con: 1) Resumen ejecutivo, 2) Causas/estado, 3) Impacto, 4) Acciones recomendadas (priorizadas), 5) Próximos pasos.
- Si hay bloqueos para cerrar el día, indícalos con bullets.
- Si hay métricas (ventas, transacciones, montos), resaltarlas de manera breve.
- Si procede, indica si conviene reintentar y qué condiciones deben cumplirse.

Contexto del usuario: "${userPrompt || ''}"
Herramienta ejecutada: ${label}
Datos del sistema (JSON):
${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}

Genera SOLO el texto final para el gerente. No incluyas JSON ni código.`;

  try {
    const llmOptions = { num_predict: DEFAULT_NUM_PREDICT };
    if (DEFAULT_NUM_THREAD) llmOptions.num_thread = DEFAULT_NUM_THREAD;
    const ollamaResp = await axios.post(`${ollamaUrl}/api/generate`, {
      model,
      prompt: llmPrompt,
      stream: false,
      keep_alive: DEFAULT_KEEP_ALIVE,
      options: llmOptions
    });
    // Ollama (stream:false) devuelve un JSON con { response }
    const respData = ollamaResp.data;
    const summary = typeof respData === 'object' && respData?.response ? respData.response : (typeof respData === 'string' ? respData : JSON.stringify(respData));
    return summary;
  } catch (err) {
    console.error('[LLM] Error generando resumen:', err?.message || err);
    return 'No se pudo generar un resumen con IA en este momento. Revise los datos y reintente.';
  }
}

// MCP endpoint
app.post('/mcp', async (req, res) => {
  try {
    console.log('HEADERS:', req.headers);
    console.log('BODY:', req.body);

    const { tool, payload } = req.body;
    const model = payload?.model || DEFAULT_LLM_MODEL;
    const userPrompt = payload?.userPrompt || payload?.prompt || '';

    // Si la query es una pregunta (prompt), usar el LLM para generar un resumen.
    // Ahora soporta contexto genérico (contextData) además del estado de cierre.
    if (tool === 'llm') {
      const { prompt, contextData, originTool } = payload || {};
      if (!prompt && !userPrompt && !contextData) {
        return res.status(400).json({ error: 'Missing prompt or contextData for llm tool' });
      }

      // 1) Intent: si el usuario pide ejecutar una acción, correr la tool correspondiente
      const intent = detectActionFromPrompt(userPrompt || prompt);
      if (intent && intent.tool) {
        let statusCode = 200;
        let rawData = null;
        try {
          switch (intent.tool) {
            case 'process_pending_transactions': {
              const event = { body: JSON.stringify(intent.payload || {}) };
              const result = await processTransactionsHandler(event);
              rawData = JSON.parse(result.body);
              statusCode = result.statusCode || 200;
              break;
            }
            case 'force_close_shifts': {
              const event = { body: JSON.stringify(intent.payload || {}) };
              const result = await closeShiftsHandler(event);
              rawData = JSON.parse(result.body);
              statusCode = result.statusCode || 200;
              break;
            }
            case 'close_business_day': {
              const date = (intent.payload && intent.payload.date) ? intent.payload.date : 'today';
              const forceClosure = !!(intent.payload && intent.payload.forceClosure);
              try {
                const apiResp = await axios.post(`${monolitoUrl}/api/business-day/close/${date}`, { forceClosure }, {
                  headers: { Authorization: `Bearer local-key-123` }
                });
                rawData = { tool: 'close_business_day', data: apiResp.data };
                statusCode = apiResp.status || 200;
              } catch (err) {
                if (err?.response?.status === 404) {
                  await axios.post(`${monolitoUrl}/api/admin/open-business-day/${date}`, {}, {
                    headers: { Authorization: `Bearer local-key-123` }
                  });
                  const apiResp = await axios.post(`${monolitoUrl}/api/business-day/close/${date}`, { forceClosure }, {
                    headers: { Authorization: `Bearer local-key-123` }
                  });
                  rawData = { tool: 'close_business_day', data: apiResp.data, reopenedBusinessDay: true };
                  statusCode = apiResp.status || 200;
                } else {
                  rawData = { tool: 'close_business_day', error: true, data: err?.response?.data || { message: err.message } };
                  statusCode = err?.response?.status || 500;
                }
              }
              break;
            }
            case 'read_local_logs': {
              const event = { body: JSON.stringify({ lines: (intent.payload && intent.payload.lines) ? intent.payload.lines : 50 }) };
              const result = await logsHandler(event);
              rawData = JSON.parse(result.body);
              statusCode = result.statusCode || 200;
              break;
            }
            case 'get_sales_data': {
              const event = { body: JSON.stringify({ businessDay: 'today' }) };
              const result = await salesHandler(event);
              rawData = JSON.parse(result.body);
              statusCode = result.statusCode || 200;
              break;
            }
            case 'get_business_day_status': {
              try {
                const apiResp = await axios.get(`${monolitoUrl}/api/business-day/today`, {
                  headers: { Authorization: `Bearer local-key-123` }
                });
                rawData = { tool: 'get_business_day_status', data: apiResp.data };
                statusCode = apiResp.status || 200;
              } catch (err) {
                rawData = { tool: 'get_business_day_status', error: true, data: err?.response?.data || { message: err.message } };
                statusCode = err?.response?.status || 500;
              }
              break;
            }
            case 'check_closure_status': {
              const event = { body: JSON.stringify({ businessDay: 'today' }) };
              const result = await closureHandler(event);
              rawData = JSON.parse(result.body);
              statusCode = result.statusCode || 200;
              break;
            }
            default:
              rawData = { tool: intent.tool, error: true, data: { message: 'Intent tool not supported from llm' } };
              statusCode = 400;
          }
        } catch (err) {
          rawData = { tool: intent.tool, error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }

        const summaryText = await summarizeWithLLM({ tool: 'llm', data: { intent, toolResult: rawData }, userPrompt, model, originTool: intent.tool });
        return res.status(statusCode).json({ tool: 'llm', executedTool: intent.tool, data: rawData, summaryText });
      }

      // 2) Sin intención de acción: usar contexto y generar resumen
      let context = contextData;
      // Si no hay contexto explícito, usar cierre del día por defecto
      if (!context) {
        try {
          const closureResp = await axios.get(`${monolitoUrl}/api/closure-status/today`, {
            headers: { Authorization: `Bearer local-key-123` }
          });
          context = { defaultContext: 'closure-status', data: closureResp.data };
          console.log('[LLM] default closure context loaded');
        } catch (err) {
          context = { defaultContext: 'closure-status', data: { error: 'No se pudo consultar el estado de cierre', details: err.message } };
          console.error('[LLM] Error consultando estado de cierre:', err);
        }
      }

      const rawData = { tool: 'llm', originTool: originTool || null, context, question: userPrompt || prompt };
      const summaryText = await summarizeWithLLM({ tool: 'llm', data: rawData, userPrompt, model, originTool });
      return res.status(200).json({ tool: 'llm', data: rawData, summaryText });
    }

    // Si es una MCP tool directa: ejecutar tool -> luego pedir resumen al LLM
    let statusCode = 200;
    let rawData = null;
    let apiResp;
    switch (tool) {
      case 'force_close_shifts': {
        try {
          const event = { body: JSON.stringify(payload || {}) };
          const result = await closeShiftsHandler(event);
          rawData = JSON.parse(result.body);
          statusCode = result.statusCode || 200;
        } catch (err) {
          rawData = { tool: 'force_close_shifts', error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }
        break;
      }
      case 'check_closure_status': {
        try {
          const event = { body: JSON.stringify({ businessDay: (payload && payload.businessDay) ? payload.businessDay : 'today' }) };
          const result = await closureHandler(event);
          rawData = JSON.parse(result.body);
          statusCode = result.statusCode || 200;
        } catch (err) {
          rawData = { tool: 'check_closure_status', error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }
        break;
      }
      case 'read_local_logs': {
        try {
          const event = { body: JSON.stringify({ lines: (payload && payload.lines) ? payload.lines : 50 }) };
          const result = await logsHandler(event);
          rawData = JSON.parse(result.body);
          statusCode = result.statusCode || 200;
        } catch (err) {
          rawData = { tool: 'read_local_logs', error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }
        break;
      }
      case 'process_pending_transactions': {
        try {
          const event = { body: JSON.stringify(payload || {}) };
          const result = await processTransactionsHandler(event);
          rawData = JSON.parse(result.body);
          statusCode = result.statusCode || 200;
        } catch (err) {
          rawData = { tool: 'process_pending_transactions', error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }
        break;
      }
      case 'get_sales_data': {
        try {
          const event = { body: JSON.stringify({ businessDay: (payload && payload.businessDay) ? payload.businessDay : 'today' }) };
          const result = await salesHandler(event);
          rawData = JSON.parse(result.body);
          statusCode = result.statusCode || 200;
        } catch (err) {
          rawData = { tool: 'get_sales_data', error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }
        break;
      }
      // Los siguientes llaman directo al monolito
      case 'get_business_day_status': {
        try {
          const date = (payload && payload.date) ? payload.date : 'today';
          apiResp = await axios.get(`${monolitoUrl}/api/business-day/${date}`, {
            headers: { Authorization: `Bearer local-key-123` }
          });
          rawData = { tool: 'get_business_day_status', data: apiResp.data };
          statusCode = apiResp.status || 200;
        } catch (err) {
          rawData = { tool: 'get_business_day_status', error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }
        break;
      }
      case 'close_business_day': {
        try {
          const date = (payload && payload.date) ? payload.date : 'today';
          const forceClosure = (payload && payload.forceClosure) ? payload.forceClosure : false;
          try {
            apiResp = await axios.post(`${monolitoUrl}/api/business-day/close/${date}`, { forceClosure }, {
              headers: { Authorization: `Bearer local-key-123` }
            });
            rawData = { tool: 'close_business_day', data: apiResp.data };
            statusCode = apiResp.status || 200;
          } catch (err) {
            if (err?.response?.status === 404) {
              // Si no existe el día de negocio, crearlo y reintentar
              await axios.post(`${monolitoUrl}/api/admin/open-business-day/${date}`, {}, {
                headers: { Authorization: `Bearer local-key-123` }
              });
              apiResp = await axios.post(`${monolitoUrl}/api/business-day/close/${date}`, { forceClosure }, {
                headers: { Authorization: `Bearer local-key-123` }
              });
              rawData = { tool: 'close_business_day', data: apiResp.data, reopenedBusinessDay: true };
              statusCode = apiResp.status || 200;
            } else {
              throw err;
            }
          }
        } catch (err) {
          rawData = { tool: 'close_business_day', error: true, data: err?.response?.data || { message: err.message } };
          statusCode = err?.response?.status || 500;
        }
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown tool' });
    }

    // Generar resumen con LLM a partir de rawData
    const summaryText = await summarizeWithLLM({ tool, data: rawData, userPrompt, model });
    const responseBody = { ...rawData, summaryText };
    return res.status(statusCode).json(responseBody);
  } catch (err) {
    console.error('Error en /mcp:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
  // Precalentar el modelo para evitar latencia de primer uso
  setTimeout(async () => {
    try {
      const warmOptions = { num_predict: 8 };
      if (DEFAULT_NUM_THREAD) warmOptions.num_thread = DEFAULT_NUM_THREAD;
      await axios.post(`${ollamaUrl}/api/generate`, {
        model: DEFAULT_LLM_MODEL,
        prompt: 'ok',
        stream: false,
        keep_alive: DEFAULT_KEEP_ALIVE,
        options: warmOptions
      });
      console.log(`[LLM] Modelo precalentado: ${DEFAULT_LLM_MODEL} (keep_alive=${DEFAULT_KEEP_ALIVE})`);
    } catch (e) {
      console.warn('[LLM] No se pudo precalentar el modelo en el arranque:', e?.message || e);
    }
  }, 1000);
});
