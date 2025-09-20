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

const app = express();

// Middlewares
app.use(cors({
  origin: 'http://localhost:3001',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json()); 
app.options('*', cors());

// MCP endpoint
app.post('/mcp', async (req, res) => {
  try {
    console.log('HEADERS:', req.headers);
    console.log('BODY:', req.body);

    const { tool, payload } = req.body;

    // Si la query es una pregunta (prompt), usar el LLM para decidir la acción
    if (tool === 'llm') {
      const { prompt, model = 'llama2' } = payload || {};
      if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt for llm tool' });
      }

      // 1. Consultar el estado de cierre del día
      let closureResp;
      try {
        closureResp = await axios.get(`${monolitoUrl}/api/closure-status/today`, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        console.log('[LLM] closureResp:', closureResp.data);
      } catch (err) {
        closureResp = { data: { error: 'No se pudo consultar el estado de cierre', details: err.message } };
        console.error('[LLM] Error consultando estado de cierre:', err);
      }

      // 2. Mejorar el prompt para el LLM
      const llmPrompt = `Eres un asistente para un sistema de gestión de restaurante. El usuario pregunta: "${prompt}"
      
    A continuación tienes el estado actual del cierre del día en formato JSON. Analiza los errores y advertencias, y explica al usuario en español, de forma clara y lógica, por qué no puede cerrar el día y qué acciones puede tomar para solucionarlo.

    Datos del sistema:
    ${JSON.stringify(closureResp.data, null, 2)}

    Responde solo sobre el contexto del restaurante y la operación de cierre, no sobre temas filosóficos o personales.`;

      let ollamaResp;
      try {
        ollamaResp = await axios.post(`${ollamaUrl}/api/generate`, {
          model,
          prompt: llmPrompt,
        });
        console.log('[LLM] ollamaResp:', ollamaResp.data);
      } catch (err) {
        console.error('[LLM] Error llamando a Ollama:', err);
        return res.status(500).json({ error: 'Error llamando a Ollama', details: err.message });
      }

      return res.status(200).json({ tool: 'llm', data: ollamaResp.data });
    }

    // Si es una MCP tool directa
    let apiResp;
    switch (tool) {
      case 'force_close_shifts': {
        // Usar el handler importado
        const event = { body: JSON.stringify(payload || {}) };
        const result = await closeShiftsHandler(event);
        const data = JSON.parse(result.body);
        return res.status(result.statusCode || 200).json(data);
      }
      case 'check_closure_status': {
        const event = { body: JSON.stringify({ businessDay: (payload && payload.businessDay) ? payload.businessDay : 'today' }) };
        const result = await closureHandler(event);
        const data = JSON.parse(result.body);
        return res.status(result.statusCode || 200).json(data);
      }
      case 'read_local_logs': {
        const event = { body: JSON.stringify({ lines: (payload && payload.lines) ? payload.lines : 50 }) };
        const result = await logsHandler(event);
        const data = JSON.parse(result.body);
        return res.status(result.statusCode || 200).json(data);
      }
      case 'process_pending_transactions': {
        const event = { body: JSON.stringify(payload || {}) };
        const result = await processTransactionsHandler(event);
        const data = JSON.parse(result.body);
        return res.status(result.statusCode || 200).json(data);
      }
      case 'get_sales_data': {
        const event = { body: JSON.stringify({ businessDay: (payload && payload.businessDay) ? payload.businessDay : 'today' }) };
        const result = await salesHandler(event);
        const data = JSON.parse(result.body);
        return res.status(result.statusCode || 200).json(data);
      }
      // Los siguientes siguen llamando directo al monolito
      case 'get_business_day_status': {
        const date = (payload && payload.date) ? payload.date : 'today';
        apiResp = await axios.get(`${monolitoUrl}/api/business-day/${date}`, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        return res.status(apiResp.status).json({ data: apiResp.data });
      }
      case 'close_business_day': {
        const date = (payload && payload.date) ? payload.date : 'today';
        const forceClosure = (payload && payload.forceClosure) ? payload.forceClosure : false;
        apiResp = await axios.post(`${monolitoUrl}/api/business-day/close/${date}`, { forceClosure }, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        return res.status(apiResp.status).json({ data: apiResp.data });
      }
      default:
        return res.status(400).json({ error: 'Unknown tool' });
    }

    if (apiResp) {
      res.status(apiResp.status).json(apiResp.data);
    }
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
});
