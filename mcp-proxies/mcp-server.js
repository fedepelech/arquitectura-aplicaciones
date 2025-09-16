const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
// Ollama integration
const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

const app = express();
app.use(bodyParser.json());

// MCP endpoint for proxies and chatbot
app.post('/mcp', async (req, res) => {
  try {
    const { tool, payload } = req.body;
    // If tool is 'llm', use Ollama
    if (tool === 'llm') {
      // payload should contain { prompt, model }
      const { prompt, model = 'llama2' } = payload;
      const ollamaResp = await axios.post(`${ollamaUrl}/api/generate`, {
        model,
        prompt
      });
      return res.status(200).json({ tool: 'llm', data: ollamaResp.data });
    }
    const monolitoUrl = process.env.MONOLITO_URL || 'http://localhost:3000';
    let apiResp;
    switch (tool) {
      case 'force_close_shifts':
        apiResp = await axios.post(`${monolitoUrl}/api/admin/force-close-shifts`, null, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        break;
      case 'check_closure_status': {
        const { businessDay } = payload;
        apiResp = await axios.get(`${monolitoUrl}/api/closure-status/${businessDay}`, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        break;
      }
      case 'read_local_logs': {
        const { lines = 50 } = payload;
        apiResp = await axios.get(`${monolitoUrl}/api/logs/closure?lines=${lines}`, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        break;
      }
      case 'process_pending_transactions':
        apiResp = await axios.post(`${monolitoUrl}/api/admin/process-pending-transactions`, null, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        break;
      case 'get_sales_data': {
        const { businessDay } = payload;
        apiResp = await axios.get(`${monolitoUrl}/api/sales/${businessDay}`, {
          headers: { Authorization: `Bearer local-key-123` }
        });
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown tool' });
    }
    res.status(apiResp.status).json(apiResp.data);
  } catch (err) {
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
