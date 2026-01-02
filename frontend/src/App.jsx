import { useState, useEffect } from 'react'
import axios from 'axios'
import './index.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
console.log('Alquimia API URL:', API_URL)

function App() {
  const [ventas, setVentas] = useState([])
  const [sheetsData, setSheetsData] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [activeSheet, setActiveSheet] = useState('Metas')
  const [modelConfig, setModelConfig] = useState({ provider: 'gemini', modelId: 'gemini-2.5-flash' })

  const availableModels = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
    { id: 'claude-opus-4-5', name: 'Claude 4.5 Opus', provider: 'claude' },
    { id: 'claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', provider: 'claude' },
    { id: 'claude-haiku-4-5', name: 'Claude 4.5 Haiku', provider: 'claude' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', provider: 'claude' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'claude' },
  ]

  // Cargar ventas de Supabase al inicio
  useEffect(() => {
    loadVentas()
    loadSheetsData('Metas')
  }, [])

  const loadVentas = async () => {
    console.log('[Frontend] Loading ventas from:', `${API_URL}/api/ventas`);
    try {
      const response = await axios.get(`${API_URL}/api/ventas`);
      console.log('[Frontend] loadVentas success:', response.data);
      if (response.data.success) {
        setVentas(response.data.data);
      }
    } catch (error) {
      console.error('[Frontend] loadVentas error:', error);
    }
  }

  const loadSheetsData = async (sheetName) => {
    console.log(`[Frontend] Loading Google Sheet: ${sheetName}`);
    try {
      const response = await axios.get(`${API_URL}/api/sheets/${sheetName}`);
      console.log(`[Frontend] loadSheetsData (${sheetName}) success:`, response.data);
      if (response.data.success) {
        setSheetsData(response.data.data);
        setActiveSheet(sheetName);
      }
    } catch (error) {
      console.error(`[Frontend] loadSheetsData (${sheetName}) error:`, error);
      setSheetsData([]);
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return

    const userMessage = {
      role: 'user',
      content: inputMessage
    }

    setChatMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setLoading(true)

    console.log('[Frontend] Sending chat message:', inputMessage);
    try {
      const response = await axios.post(`${API_URL}/api/chat`, {
        message: inputMessage,
        history: chatMessages,
        modelConfig: modelConfig
      })
      console.log('[Frontend] Chat response received:', response.data);

      if (response.data.success) {
        const assistantMessage = {
          role: 'assistant',
          content: response.data.response,
          toolsUsed: response.data.toolsUsed
        }
        setChatMessages(prev => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error('[Frontend] Chat error:', error);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Lo siento, ocurrió un error al procesar tu mensaje.',
        error: true
      }])
    } finally {
      setLoading(false);
      console.log('[Frontend] Chat loading state: false');
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setUploadStatus({ type: 'loading', message: 'Subiendo archivo...' })

    console.log(`[Frontend] Starting file upload: ${file.name}, size: ${file.size}`);
    try {
      const response = await axios.post(`${API_URL}/api/upload-csv`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      console.log('[Frontend] Upload success:', response.data);

      if (response.data.success) {
        setUploadStatus({
          type: 'success',
          message: `✓ ${response.data.message}`
        })
        console.log('[Frontend] Triggering loadVentas after upload');
        loadVentas() // Recargar datos
        setTimeout(() => setUploadStatus(null), 5000)
      }
    } catch (error) {
      console.error('[Frontend] Upload error:', error);
      setUploadStatus({
        type: 'error',
        message: `Error: ${error.response?.data?.error || error.message}`
      })
      setTimeout(() => setUploadStatus(null), 8000)
    }

    event.target.value = ''
  }

  const formatNumber = (num) => {
    if (!num && num !== 0) return '-'
    return parseFloat(num).toLocaleString('es-CL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <h1>🚀 Alquimia Datalive - MVP</h1>
        <p>Conversaciones inteligentes con tus datos usando IA + MCP</p>
        <div style={{ marginTop: '10px' }}>
          <span className="stat">
            <strong>{ventas.length}</strong> ventas en Supabase
          </span>
          <span className="stat">
            <strong>{sheetsData.length}</strong> registros en Google Sheets
          </span>
        </div>
      </div>

      {/* Upload CSV */}
      <div className="card">
        <h2>📤 Cargar Datos CSV</h2>
        <div className="file-input">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
          />
          <button>Seleccionar Archivo</button>
        </div>
        {uploadStatus && (
          <div className={uploadStatus.type === 'error' ? 'error' : uploadStatus.type === 'success' ? 'success' : 'loading'}>
            {uploadStatus.message}
          </div>
        )}
      </div>

      {/* Tablas de datos */}
      <div className="grid">
        {/* Tabla Supabase */}
        <div className="card">
          <h2>📊 Ventas (Supabase)</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Canal</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Cantidad</th>
                  <th>Ingreso</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {ventas.slice(0, 50).map((venta, idx) => (
                  <tr key={idx}>
                    <td>{venta.dia}</td>
                    <td>{venta.canal}</td>
                    <td>{venta.marca}</td>
                    <td style={{ fontSize: '0.75rem' }}>{venta.modelo}</td>
                    <td>{venta.cantidad}</td>
                    <td>${formatNumber(venta.ingreso_neto)}</td>
                    <td style={{ color: venta.margen >= 0 ? 'green' : 'red' }}>
                      ${formatNumber(venta.margen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabla Google Sheets */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2>📈 Google Sheets</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['Metas', 'Forecast', 'Comisiones', 'Catalogo'].map(sheet => (
                <button
                  key={sheet}
                  onClick={() => loadSheetsData(sheet)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    background: activeSheet === sheet ? '#667eea' : '#e0e0e0',
                    color: activeSheet === sheet ? 'white' : '#333'
                  }}
                >
                  {sheet}
                </button>
              ))}
            </div>
          </div>
          <div className="table-container">
            {sheetsData.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    {Object.keys(sheetsData[0]).map((key, idx) => (
                      <th key={idx}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheetsData.slice(0, 50).map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((value, i) => (
                        <td key={i}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="loading">
                No hay datos disponibles. Configura tu Google Sheet en el backend.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat con IA */}
      <div className="card chat-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>💬 Chat con IA + MCP</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>Modelo:</span>
            <select
              value={`${modelConfig.provider}:${modelConfig.modelId}`}
              onChange={(e) => {
                const [provider, modelId] = e.target.value.split(':');
                setModelConfig({ provider, modelId });
              }}
              style={{
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <optgroup label="Google Gemini">
                {availableModels.filter(m => m.provider === 'gemini').map(model => (
                  <option key={model.id} value={`gemini:${model.id}`}>{model.name}</option>
                ))}
              </optgroup>
              <optgroup label="Anthropic Claude">
                {availableModels.filter(m => m.provider === 'claude').map(model => (
                  <option key={model.id} value={`claude:${model.id}`}>{model.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
        <div className="chat-container">
          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>👋 ¡Hola! Soy tu asistente de datos</p>
                <p>Puedo ayudarte a analizar tus ventas de Supabase y datos de Google Sheets.</p>
                <p style={{ marginTop: '15px', fontSize: '0.9rem', fontStyle: 'italic' }}>
                  Ejemplos: "¿Cuántas unidades de HONOR vendimos?", "Muéstrame el top 10 por margen", "Compara ventas vs forecast"
                </p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  <div className="message-role">
                    {msg.role === 'user' ? '👤 Tú' : '🤖 Asistente'}
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <span className="badge" style={{ marginLeft: '10px' }}>
                        MCP: {msg.toolsUsed.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))
            )}
            {loading && (
              <div className="message assistant">
                <div className="loading">⏳ Pensando y consultando datos...</div>
              </div>
            )}
          </div>

          <div className="chat-input">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Haz una pregunta sobre tus datos..."
              disabled={loading}
            />
            <button onClick={handleSendMessage} disabled={loading || !inputMessage.trim()}>
              {loading ? '⏳' : '🚀'} Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
