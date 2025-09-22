import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
const API_KEY = 'local-key-123';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});


export const restaurantAPI = {
  // Solo el ChatBot usa MCP
  askLLM: async (prompt) => {
    try {
      const mcpBase = process.env.REACT_APP_MCP_URL || 'http://localhost:4000';
      const resp = await axios.post(`${mcpBase}/mcp`, {
        tool: 'llm',
        payload: { prompt }
      });
      return resp;
    } catch (err) {
      throw err;
    }
  },

  // Dashboard usa backend REST
  getSalesData: async () => {
    try {
      const resp = await api.get('/api/sales/today');
      return resp;
    } catch (err) {
      throw err;
    }
  },
  getClosureStatus: async () => {
    try {
      const resp = await api.get('/api/closure-status/today');
      return resp;
    } catch (err) {
      throw err;
    }
  },
  closeBusinessDay: async (force = false) => {
    try {
      const resp = await api.post('/api/business-day/close/today', { forceClosure: force });
      return resp;
    } catch (err) {
      throw err;
    }
  },
  getLocalLogs: async (lines = 50) => {
    try {
      const resp = await api.get(`/api/logs/system?lines=${lines}`);
      return resp;
    } catch (err) {
      throw err;
    }
  },
  getHealth: () => api.get('/health')
};

export default api;
