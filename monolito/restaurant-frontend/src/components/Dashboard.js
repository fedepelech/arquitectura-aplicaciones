import React, { useState, useEffect } from 'react';
import { restaurantAPI } from '../services/api';
import ChatBot from './ChatBot';
import './Dashboard.css';

const Dashboard = () => {
  const [salesData, setSalesData] = useState(null);
  const [closureStatus, setClosureStatus] = useState(null);
  const [localLogs, setLocalLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [showChat, setShowChat] = useState(false);



  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [salesResponse, closureResponse, logsResponse] = await Promise.all([
        restaurantAPI.getSalesData(),
        restaurantAPI.getClosureStatus(),
        restaurantAPI.getLocalLogs(50)
      ]);
      setSalesData(salesResponse.data);
      setClosureStatus(closureResponse.data);
      setLocalLogs(logsResponse.data?.lines || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDay = async () => {
    setClosing(true);
    try {
      const response = await restaurantAPI.closeBusinessDay();
      alert('✅ Día cerrado exitosamente!');
      await loadDashboardData();
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Error desconocido';
      alert(`❌ Error: \n${errorMessage}`);
    } finally {
      setClosing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="dashboard loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Cargando datos del restaurante...</p>
        </div>
      </div>
    );
  }

  // Visualización de logs
  const renderLogs = () => (
    <div className="dashboard-logs">
      <h4>Últimos logs del sistema</h4>
      <pre style={{ background: '#222', color: '#eee', padding: '1em', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto' }}>
        {localLogs.length > 0 ? localLogs.join('\n') : 'No hay logs disponibles.'}
      </pre>
    </div>
  );

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1>🍽️ Restaurant Manager</h1>
          {/* Eliminado botón de recarga manual */}
          <div className="header-info">
            <span className="local-id">{closureStatus?.localId}</span>
            <span className="business-date">{closureStatus?.businessDate}</span>
            <span className={`status ${closureStatus?.details?.businessDay?.status}`}>
              {closureStatus?.details?.businessDay?.status === 'open' ? '🟢 ABIERTO' : '🔴 CERRADO'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Sales Summary */}
        <div className="card sales-card">
          <div className="card-header">
            <h2>📊 Resumen de Ventas</h2>
            <span className="update-time">
              Actualizado: {new Date().toLocaleTimeString()}
            </span>
          </div>
          <div className="card-content">
            <div className="metrics-grid">
              <div className="metric">
                <div className="metric-value">${salesData?.summary?.totalSales?.toFixed(2) || '0.00'}</div>
                <div className="metric-label">Ventas Totales</div>
              </div>
              <div className="metric">
                <div className="metric-value">{salesData?.summary?.totalTransactions || 0}</div>
                <div className="metric-label">Transacciones</div>
              </div>
              <div className="metric">
                <div className="metric-value">${salesData?.summary?.averageTicket?.toFixed(2) || '0.00'}</div>
                <div className="metric-label">Ticket Promedio</div>
              </div>
              <div className="metric">
                <div className="metric-value">{salesData?.summary?.unprocessedCount || 0}</div>
                <div className="metric-label">Sin Procesar</div>
              </div>
            </div>
          </div>
        </div>

        {/* POS Status */}
        <div className="card pos-card">
          <div className="card-header">
            <h2>🖥️ Estado de POS</h2>
          </div>
          <div className="card-content">
            <div className="pos-grid">
              {salesData?.byPos?.map((pos, index) => {
                const salesAmount = typeof pos.sales === 'number'
                  ? pos.sales
                  : parseFloat(pos.sales || 0);
                return (
                  <div key={index} className="pos-item">
                    <div className="pos-name">{pos.pos_name}</div>
                    <div className="pos-stats">
                      <span className="pos-transactions">{pos.transactions} ventas</span>
                      <span className="pos-sales">${salesAmount.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="card system-card">
          <div className="card-header">
            <h2>⚠️ Estado del Sistema</h2>
          </div>
          <div className="card-content">
            <div className="system-status">
              <div className={`status-indicator ${closureStatus?.canClose ? 'success' : 'error'}`}>
                {closureStatus?.canClose ? '✅ Sistema OK' : '❌ Hay problemas'}
              </div>
              <div className="status-summary">
                <div className="status-item">
                  <span className="status-count error">{closureStatus?.summary?.totalErrors || 0}</span>
                  <span className="status-text">Errores</span>
                </div>
                <div className="status-item">
                  <span className="status-count warning">{closureStatus?.summary?.totalWarnings || 0}</span>
                  <span className="status-text">Advertencias</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="card actions-card">
          <div className="card-header">
            <h2>🎯 Acciones</h2>
          </div>
          <div className="card-content">
            <button 
              className={`close-day-btn ${closureStatus?.details?.businessDay?.status === 'closed' ? 'disabled' : ''}`}
              onClick={handleCloseDay}
              disabled={closing || closureStatus?.details?.businessDay?.status === 'closed'}
            >
              {closing ? (
                <>
                  <span className="spinner small"></span>
                  Cerrando día...
                </>
              ) : closureStatus?.details?.businessDay?.status === 'closed' ? (
                '✅ Día ya cerrado'
              ) : (
                '🔒 Cerrar Día de Negocio'
              )}
            </button>
            <p className="action-hint">
              {closureStatus?.details?.businessDay?.status === 'closed' 
                ? 'El día de negocio ha sido cerrado exitosamente'
                : 'Cierra el día de negocio cuando hayas completado todas las operaciones'
              }
            </p>
          </div>
        </div>
      </main>

      {/* Floating Chat Button */}
      <button 
        className="chat-fab"
        onClick={() => setShowChat(true)}
        title="Abrir Asistente IA"
      >
        🤖
      </button>

      {/* ChatBot Component */}
      {showChat && (
        <ChatBot 
          onClose={() => setShowChat(false)}
          onRefreshData={loadDashboardData}
        />
      )}
    </div>
  );
}

export default Dashboard;
