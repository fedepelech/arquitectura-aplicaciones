import React, { useState, useRef, useEffect } from 'react';
import './ChatBot.css';

// Asigna la tool adecuada según el prompt
const getToolForPrompt = (prompt) => {
	const p = prompt.toLowerCase();
	if (p.includes('cerrar') && p.includes('día')) return 'check_closure_status';
	if (p.includes('ventas')) return 'get_sales_data';
	if (p.includes('problema') || p.includes('error') || p.includes('logs')) return 'read_local_logs';
	if (p.includes('procesar') && p.includes('transacciones')) return 'process_pending_transactions';
	if (p.includes('turnos')) return 'force_close_shifts';
	// fallback: usa LLM
	return 'llm';
};

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

		// Determinar la tool adecuada y validar que exista
		const tool = getToolForPrompt(userMessage.text);
		let payload = {};
			switch (tool) {
				case 'llm':
					payload = { prompt: `Responde SIEMPRE en español. ${userMessage.text}`, model: 'llama2' };
					break;
			case 'check_closure_status':
				payload = { businessDay: 'today' };
				break;
			case 'get_sales_data':
				payload = { businessDay: 'today' };
				break;
			case 'read_local_logs':
				payload = { lines: 50 };
				break;
			case 'process_pending_transactions':
				payload = { businessDay: 'today' };
				break;
			case 'force_close_shifts':
				payload = { businessDay: 'today' };
				break;
			default:
				payload = { prompt: userMessage.text, model: 'llama2' };
				break;
		}

		try {
			const response = await fetch('http://localhost:4000/mcp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ tool, payload })
			});
			let botText = '';
			let data = null;
			try {
				data = await response.json();
			} catch (jsonErr) {
				botText = 'Error: respuesta inválida del servidor MCP.';
			}
			if (!response.ok) {
				// Error HTTP, mostrar mensaje real del backend si existe
				botText = data?.error || data?.message || `Error ${response.status}: ${response.statusText}. Verifica la herramienta seleccionada.`;
			} else if (data?.error) {
				botText = `Error: ${data.error}`;
			} else {
				// Extraer texto según tool y mostrar mensaje útil si los datos están vacíos
						switch (tool) {
							case 'read_local_logs':
								if (data?.lines) {
									botText = 'Últimos logs:\n' + data.lines.join('\n');
								} else if (data?.data?.lines) {
									botText = 'Últimos logs:\n' + data.data.lines.join('\n');
								} else {
									botText = 'No se pudo leer los logs. ' + (data?.message || '');
								}
								break;
							case 'process_pending_transactions':
								botText = data?.data?.message || data?.message || 'Transacciones procesadas.';
								break;
							case 'force_close_shifts':
								botText = data?.data?.message || data?.message || 'Turnos cerrados.';
								break;
							default:
								if (tool === 'llm' && typeof data?.data === 'string') {
									try {
										const lines = data.data.split('\n').filter(Boolean);
										const tokens = lines.map(line => {
											try {
												return JSON.parse(line).response || '';
											} catch {
												return '';
											}
										});
										botText = tokens.join('');
									} catch {
										botText = data.data;
									}
								} else {
									botText = JSON.stringify(data, null, 2);
								}
								break;
						}
			}
			const botMessage = {
				id: Date.now() + 1,
				text: botText,
				sender: 'bot',
				timestamp: new Date()
			};
			setMessages(prev => [...prev, botMessage]);
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
