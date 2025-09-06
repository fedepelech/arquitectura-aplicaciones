import React, { useState, useRef, useEffect } from 'react';
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Simulate AI response (replace with actual MCP integration later)
    setTimeout(() => {
      const botMessage = {
        id: Date.now() + 1,
        text: generateBotResponse(inputText),
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    }, 2000);
  };

  const generateBotResponse = (userInput) => {
    const input = userInput.toLowerCase();
    
    if (input.includes('cerrar') && input.includes('día')) {
      return "Para cerrar el día de negocio, necesito verificar el estado del sistema. Déjame revisar... 🔍\n\nVeo que hay algunos problemas que impiden el cierre:\n\n1. 🚫 7 transacciones sin procesar\n2. 👥 2 turnos aún abiertos\n3. 💰 Diferencia de caja en POS Delivery\n\n¿Te gustaría que solucione estos problemas automáticamente?";
    }
    
    if (input.includes('ventas')) {
      return "📊 Las ventas de hoy van muy bien:\n\n• Total: $2,450.75\n• 87 transacciones\n• Ticket promedio: $28.17\n\nLa POS Principal es la que más vendió con $1,200.33. ¿Necesitas más detalles?";
    }
    
    if (input.includes('problema') || input.includes('error')) {
      return "🔍 He detectado estos problemas en el sistema:\n\n❌ **Errores críticos:**\n• Transacciones sin procesar\n• Turnos no cerrados\n• Diferencias de caja\n\n⚠️ **Advertencias:**\n• Inventario sin contar\n• Datos incompletos en ventas\n\n¿Quieres que te ayude a resolver alguno específico?";
    }
    
    if (input.includes('sí') || input.includes('si') || input.includes('ok') || input.includes('dale')) {
      return "✅ Perfecto! Procesando soluciones automáticas...\n\n🔄 Procesando transacciones pendientes...\n🔄 Cerrando turnos abiertos...\n🔄 Actualizando balances de caja...\n\n¡Listo! Los problemas han sido resueltos. Ahora puedes cerrar el día de negocio sin inconvenientes.";
    }
    
    if (input.includes('hola') || input.includes('ayuda')) {
      return "¡Hola! Puedo ayudarte con:\n\n🔍 Diagnosticar problemas de cierre\n📊 Revisar ventas y estadísticas\n🛠️ Resolver problemas automáticamente\n📋 Consultar estado de POS y turnos\n\n¿Qué necesitas saber?";
    }
    
    return "Entiendo tu consulta. En este momento estoy en modo demo, pero pronto podré conectarme con el sistema MCP para darte respuestas más precisas y ejecutar acciones reales. ¿Hay algo específico sobre el cierre de día o las ventas que te preocupe?";
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    "¿Por qué no puedo cerrar el día?",
    "¿Cómo van las ventas de hoy?",
    "¿Hay algún problema en el sistema?",
    "Ayúdame a cerrar el día"
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
          {quickActions.map((action, index) => (
            <button
              key={index}
              className="quick-action-btn"
              onClick={() => setInputText(action)}
            >
              {action}
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
            onClick={sendMessage} 
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
