import React, { useState, useRef } from 'react';
import './ChatBot.css';

const ChatBot = ({ onClose, onRefreshData }) => {
    const [messages, setMessages] = useState([
        {
            id: 1,
            text: "¡Hola! Soy tu asistente inteligente del restaurante. ¿En qué puedo ayudarte hoy?",
            sender: 'bot',
            timestamp: new Date()
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    // URL base del MCP (configurable por env)
    const MCP_BASE_URL = process.env.REACT_APP_MCP_URL || 'http://localhost:4000';

    const sendMessage = async (overrideText) => {
        const textToSend = (overrideText !== undefined && overrideText !== null) ? overrideText : inputText;
        if (!textToSend.trim()) return;

        const userMessage = {
            id: Date.now(),
            text: textToSend,
            sender: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setIsTyping(true);

        // Confirmación previa basada en el texto (forzar cierre del día)
        const lower = userMessage.text.toLowerCase();
        const wantsClose = lower.includes('cerrar') || lower.includes('cierre');
        const hasDia = lower.includes('día') || lower.includes('dia') || lower.includes('jornada');
        const wantsForce = lower.includes('forzar') || lower.includes('forzado') || lower.includes('force');
        if (wantsClose && hasDia && wantsForce) {
            const confirmed = window.confirm(
                '⚠️ Vas a forzar el cierre del día de negocio.\n\n' +
                'Esta acción puede dejar inconsistencias temporales (por ejemplo, turnos abiertos o transacciones sin procesar).\n' +
                '¿Confirmás continuar con el cierre forzado?'
            );
            if (!confirmed) {
                setMessages(prev => [...prev, {
                    id: Date.now() + 3,
                    text: 'Operación cancelada. No se realizó el cierre forzado.',
                    sender: 'bot',
                    timestamp: new Date()
                }]);
                setIsTyping(false);
                return;
            }
        }

        try {
            const response = await fetch(`${MCP_BASE_URL}/mcp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tool: 'llm', payload: { prompt: userMessage.text } })
            });
            let botText = '';
            let data = null;
            try {
                data = await response.json();
            } catch (jsonErr) {
                botText = 'Error: respuesta inválida del servidor MCP.';
            }
            // Preferir SIEMPRE el resumen del LLM (aunque el status no sea 2xx).
            if (data?.summaryText) {
                botText = data.summaryText;
            } else {
                botText = 'No pude generar un resumen con IA en este momento. Por favor, reintenta más tarde o consulta el estado en el panel.';
            }
            const botMessage = {
                id: Date.now() + 1,
                text: botText,
                sender: 'bot',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botMessage]);
            // Refrescar datos del dashboard si se ejecutaron acciones que cambian el estado
            const executedTool = data?.executedTool || data?.data?.tool;
            if (['process_pending_transactions', 'force_close_shifts', 'close_business_day'].includes(executedTool)) {
                try { onRefreshData && (await onRefreshData()); } catch {}
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                id: Date.now() + 2,
                text: 'Error al conectar con el servidor MCP: ' + err.message,
                sender: 'bot',
                timestamp: new Date()
            }]);
        }
        setIsTyping(false);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const quickActions = [
        { label: "¿Por qué no puedo cerrar el día?", text: "¿Por qué no puedo cerrar el día?" },
        { label: "¿Cómo van las ventas de hoy?", text: "¿Cómo van las ventas de hoy?" },
        { label: "Ver estado del día de negocio", text: "Ver estado del día de negocio" },
        { label: "Procesar transacciones pendientes", text: "Procesar transacciones pendientes" },
        { label: "Cerrar turnos abiertos", text: "Cerrar turnos abiertos" },
        { label: "Forzar cierre del día", text: "Forzar cierre del día" }
    ];

    return (
        <div className="chatbot-overlay">
            <div className="chatbot-container">
                {/* Header */}
                <div className="chatbot-header">
                    <div className="bot-info">
                        <div className="bot-avatar">🤖</div>
                        <div className="bot-details">
                            <h3>Asistente IA</h3>
                            <span className="bot-status">🟢 En línea</span>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                {/* Messages */}
                <div className="chatbot-messages">
                    {messages.map((message) => (
                        <div key={message.id} className={`message ${message.sender}`}>
                            <div className="message-content">
                                <div className="message-text">{message.text}</div>
                                <div className="message-time">
                                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="message bot">
                            <div className="message-content">
                                <div className="typing-indicator">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick Actions */}
                <div className="quick-actions">
                    {quickActions.map((action) => (
                        <button
                            key={action.label}
                            className="quick-action-btn"
                            onClick={() => sendMessage(action.text)}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
                {/* Input */}
                <div className="chatbot-input">
                    <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Escribe tu pregunta..."
                        rows="2"
                        disabled={isTyping}
                    />
                    <button
                        onClick={() => sendMessage()}
                        disabled={!inputText.trim() || isTyping}
                        className="send-btn"
                    >
                        📤
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatBot;
