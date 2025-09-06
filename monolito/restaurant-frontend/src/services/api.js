import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';
const API_KEY = 'local-key-123';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

export const restaurantAPI = {
  // Dashboard data
  getBusinessDayStatus: () => api.get('/api/business-day/today'),
  getSalesData: () => api.get('/api/sales/today'),
  getClosureStatus: () => api.get('/api/closure-status/today'),
  
  // Actions
  closeBusinessDay: (force = false) => api.post('/api/business-day/close/today', { forceClosure: force }),
  processPendingTransactions: () => api.post('/api/admin/process-pending-transactions'),
  forceCloseShifts: () => api.post('/api/admin/force-close-shifts'),
  
  // Health
  getHealth: () => api.get('/health')
};

export default api;
