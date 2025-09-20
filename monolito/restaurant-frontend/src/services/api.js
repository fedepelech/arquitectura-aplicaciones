import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_MCP_URL || 'http://localhost:4000';
const API_KEY = 'local-key-123';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

export const restaurantAPI = {
  // MCP LLM query
  askLLM: async (prompt, model = 'llama2') => {
    console.log('[API] LLM request:', { tool: 'llm', payload: { prompt, model } });
    try {
      const resp = await api.post('/mcp', {
        tool: 'llm',
        payload: { prompt, model }
      });
      console.log('[API] LLM response:', resp);
      return resp;
    } catch (err) {
      console.error('[API] LLM error:', err);
      throw err;
    }
  },

  // MCP tools (adaptados para dashboard)
  // getBusinessDayStatus eliminado: no es una tool MCP válida
  getSalesData: async () => {
    console.log('[API] getSalesData request:', { tool: 'get_sales_data', payload: { businessDay: 'today' } });
    try {
      const resp = await api.post('/mcp', { tool: 'get_sales_data', payload: { businessDay: 'today' } });
      console.log('[API] getSalesData response:', resp);
      return resp;
    } catch (err) {
      console.error('[API] getSalesData error:', err);
      throw err;
    }
  },
  getClosureStatus: async () => {
    console.log('[API] getClosureStatus request:', { tool: 'check_closure_status', payload: { businessDay: 'today' } });
    try {
      const resp = await api.post('/mcp', { tool: 'check_closure_status', payload: { businessDay: 'today' } });
      console.log('[API] getClosureStatus response:', resp);
      return resp;
    } catch (err) {
      console.error('[API] getClosureStatus error:', err);
      throw err;
    }
  },
  closeBusinessDay: async (force = false) => {
    console.log('[API] closeBusinessDay request:', { tool: 'close_business_day', payload: { date: 'today', forceClosure: force } });
    try {
      const resp = await api.post('/mcp', { tool: 'close_business_day', payload: { date: 'today', forceClosure: force } });
      console.log('[API] closeBusinessDay response:', resp);
      return resp;
    } catch (err) {
      console.error('[API] closeBusinessDay error:', err);
      throw err;
    }
  },
  processPendingTransactions: async () => {
    console.log('[API] processPendingTransactions request:', { tool: 'process_pending_transactions', payload: {} });
    try {
      const resp = await api.post('/mcp', { tool: 'process_pending_transactions', payload: {} });
      console.log('[API] processPendingTransactions response:', resp);
      return resp;
    } catch (err) {
      console.error('[API] processPendingTransactions error:', err);
      throw err;
    }
  },
  forceCloseShifts: async () => {
    console.log('[API] forceCloseShifts request:', { tool: 'force_close_shifts', payload: {} });
    try {
      const resp = await api.post('/mcp', { tool: 'force_close_shifts', payload: {} });
      console.log('[API] forceCloseShifts response:', resp);
      return resp;
    } catch (err) {
      console.error('[API] forceCloseShifts error:', err);
      throw err;
    }
  },
  getLocalLogs: async (lines = 50) => {
    console.log('[API] getLocalLogs request:', { tool: 'read_local_logs', payload: { lines } });
    try {
      const resp = await api.post('/mcp', { tool: 'read_local_logs', payload: { lines } });
      console.log('[API] getLocalLogs response:', resp);
      return resp;
    } catch (err) {
      console.error('[API] getLocalLogs error:', err);
      throw err;
    }
  },
  getHealth: () => api.get('/health')
};

export default api;
