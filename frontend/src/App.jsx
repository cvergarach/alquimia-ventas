import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import './index.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
console.log('Alquimia API URL:', API_URL)

function App() {
  const [ventas, setVentas] = useState([])
  const [totalVentasCount, setTotalVentasCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sheetsData, setSheetsData] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [activeSheet, setActiveSheet] = useState('Metas')
  const [modelConfig, setModelConfig] = useState({ provider: 'gemini', modelId: 'gemini-2.5-flash' })
  const [kpis, setKpis] = useState({ total_unidades: 0, total_ingreso: 0, total_margen: 0, margenPct: 0 })
  const [chartsData, setChartsData] = useState({ trend: [], channels: [], brands: [] })
  const [activeSection, setActiveSection] = useState('dashboard') // dashboard, chats, data
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [filters, setFilters] = useState({ canal: '', marca: '', sucursal: '', fecha_inicio: '', fecha_fin: '' })
  const [filterOptions, setFilterOptions] = useState({ canales: [], marcas: [], sucursales: [] })
  const messagesEndRef = useRef(null)

  const availableModels = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', icon: '⚡' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', icon: '🧠' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', provider: 'claude', icon: '🎭' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'claude', icon: '🕊️' },
  ]

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages, loading])

  // Cargar datos al inicio
  useEffect(() => {
    loadVentas(1)
    loadAnalytics()
    loadFilters()
    loadSheetsData('Metas')
  }, [])

  // Recargar analytics cuando los filtros cambien
  useEffect(() => {
    loadAnalytics()
  }, [filters])

  const loadVentas = async (page = 1) => {
    console.log(`[Frontend] Loading ventas page ${page}`);
    try {
      // Pasamos también los filtros a la tabla si queremos que sea reactiva (opcional, pero recomendado)
      const params = new URLSearchParams({ page, limit: 50, ...filters }).toString();
      const response = await axios.get(`${API_URL}/api/ventas?${params}`);
      if (response.data.success) {
        setVentas(response.data.data);
        setTotalVentasCount(response.data.total);
        setTotalPages(response.data.totalPages);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('[Frontend] loadVentas error:', error);
    }
  }

  const loadFilters = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/analytics/filters`);
      if (response.data.success) {
        setFilterOptions(response.data.data);
      }
    } catch (error) {
      console.error('[Frontend] loadFilters error:', error);
    }
  }

  const loadAnalytics = async () => {
    console.log('[Frontend] Loading analytics with filters:', filters);
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const [kpiRes, chartRes] = await Promise.all([
        axios.get(`${API_URL}/api/analytics/kpis?${queryParams}`),
        axios.get(`${API_URL}/api/analytics/charts?${queryParams}`)
      ]);

      if (kpiRes.data.success) {
        const data = kpiRes.data.data;
        setKpis({
          ...data,
          margenPct: data.total_ingreso > 0 ? (data.total_margen / data.total_ingreso) * 100 : 0
        });
      }

      if (chartRes.data.success) {
        setChartsData(chartRes.data.data);
      }
    } catch (error) {
      console.error('[Frontend] loadAnalytics error:', error);
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Respuesta copiada al portapapeles. ¡Lista para WhatsApp!')
    })
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
        loadVentas(1)
        loadAnalytics()
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })
  }

  const handleClearChat = () => {
    setChatMessages([])
  }

  const COLORS = ['#667eea', '#764ba2', '#4c51bf', '#6b46c1', '#5a67d8', '#805ad5'];

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val)
  }

  return (
    <div className="layout-wrapper">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="user-avatar" style={{ background: '#667eea', color: 'white' }}>AL</div>
          <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>DATALIVE</span>
        </div>

        <nav className="sidebar-nav">
          <div className={`nav-item ${activeSection === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveSection('dashboard'); setIsSidebarOpen(false); }}>
            <span>📊</span> Dashboard
          </div>
          <div className={`nav-item ${activeSection === 'data' ? 'active' : ''}`} onClick={() => { setActiveSection('data'); setIsSidebarOpen(false); }}>
            <span>💾</span> Datos
          </div>
          <div className={`nav-item ${activeSection === 'chats' ? 'active' : ''}`} onClick={() => { setActiveSection('chats'); setIsSidebarOpen(false); }}>
            <span>💬</span> Chats
          </div>

          <div className="sidebar-section-title">Administración</div>
          <div className={`nav-item ${activeSection === 'users' ? 'active' : ''}`} onClick={() => { setActiveSection('users'); setIsSidebarOpen(false); }}>
            <span>👥</span> Usuarios
          </div>
          <div className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => { setActiveSection('settings'); setIsSidebarOpen(false); }}>
            <span>⚙️</span> Configuración
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">CV</div>
            <div className="user-info">
              <div className="user-name">cvergarach@gmail.com</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Admin</div>
            </div>
          </div>
          <div className="nav-item" style={{ padding: '8px 0', fontSize: '0.8rem' }}>
            <span>🚪</span> Cerrar Sesión
          </div>
        </div>
      </aside>

      {/* Main Content Container */}
      <main className="main-container">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button className="menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? '✕' : '☰'}
            </button>
            <div>
              <div className="top-bar-title">
                {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}
              </div>
              <div className="top-bar-subtitle">Bienvenido al espacio de trabajo de Alquimia</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '1.2rem', cursor: 'pointer' }}>🔔</div>
          </div>
        </header>

        <div className="content-area">
          {activeSection === 'dashboard' && (
            <>
              {/* Filter Bar */}
              <div className="filter-bar">
                <div className="filter-group">
                  <label>📅 Periodo</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="date"
                      className="glass-input"
                      value={filters.fecha_inicio}
                      onChange={(e) => setFilters({ ...filters, fecha_inicio: e.target.value })}
                    />
                    <input
                      type="date"
                      className="glass-input"
                      value={filters.fecha_fin}
                      onChange={(e) => setFilters({ ...filters, fecha_fin: e.target.value })}
                    />
                  </div>
                </div>

                <div className="filter-group">
                  <label>📢 Canal</label>
                  <select
                    className="glass-select"
                    value={filters.canal}
                    onChange={(e) => setFilters({ ...filters, canal: e.target.value })}
                  >
                    <option value="">Todos los Canales</option>
                    {filterOptions.canales.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="filter-group">
                  <label>🏷️ Marca</label>
                  <select
                    className="glass-select"
                    value={filters.marca}
                    onChange={(e) => setFilters({ ...filters, marca: e.target.value })}
                  >
                    <option value="">Todas las Marcas</option>
                    {filterOptions.marcas.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="filter-group">
                  <label>🏠 Sucursal</label>
                  <select
                    className="glass-select"
                    value={filters.sucursal}
                    onChange={(e) => setFilters({ ...filters, sucursal: e.target.value })}
                  >
                    <option value="">Todas las Sucursales</option>
                    {filterOptions.sucursales.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <button className="clear-filters-btn" onClick={() => setFilters({ canal: '', marca: '', sucursal: '', fecha_inicio: '', fecha_fin: '' })}>
                  Limpiar
                </button>
              </div>

              {/* KPI Summary */}
              <div className="dashboard-summary">
                <div className="kpi-card">
                  <div className="kpi-card-content">
                    <div className="kpi-label">Total Unidades</div>
                    <div className="kpi-value">{formatNumber(kpis.total_unidades)}</div>
                    <div className="trend-badge trend-up">+0%</div>
                  </div>
                  <div className="kpi-icon">📦</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-card-content">
                    <div className="kpi-label">Ingreso Bruto</div>
                    <div className="kpi-value">{formatCurrency(kpis.total_ingreso)}</div>
                    <div className="trend-badge trend-up">+0%</div>
                  </div>
                  <div className="kpi-icon">💰</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-card-content">
                    <div className="kpi-label">Margen Neto</div>
                    <div className="kpi-value">{formatCurrency(kpis.total_margen)}</div>
                    <div className="trend-badge trend-up">+0%</div>
                  </div>
                  <div className="kpi-icon">📈</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-card-content">
                    <div className="kpi-label">Eficiencia (Mgn%)</div>
                    <div className="kpi-value">{kpis.margenPct.toFixed(1)}%</div>
                    <div className="trend-badge trend-up">+0%</div>
                  </div>
                  <div className="kpi-icon">🎯</div>
                </div>
              </div>

              {/* Charts & Widgets */}
              <div className="grid">
                <div className="card">
                  <h2>Tendencia de Ventas (u)</h2>
                  <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartsData.trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" hide />
                        <YAxis hide />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="#667eea" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card">
                  <h2>Acciones Rápidas</h2>
                  <div className="quick-actions">
                    <div className="action-btn" onClick={() => document.getElementById('dash-file-upload').click()}>
                      + Cargar Ventas CSV
                    </div>
                    <input
                      id="dash-file-upload"
                      type="file"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                      accept=".csv"
                    />
                    <div className="action-btn" onClick={() => setActiveSection('chats')}>
                      Consultar IA
                    </div>
                    <div className="action-btn" onClick={() => window.open('https://docs.google.com/spreadsheets/d/' + import.meta.env.VITE_GOOGLE_SHEET_ID)}>
                      Ver Metas (Sheets)
                    </div>
                    <div className="action-btn" onClick={loadAnalytics}>
                      Refrescar Datos
                    </div>
                  </div>
                  {uploadStatus && (
                    <div className={`status ${uploadStatus.type}`} style={{ marginTop: '15px' }}>
                      {uploadStatus.message}
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <h2>Actividad Reciente</h2>
                <div className="activity-list">
                  <div className="activity-item">
                    <div className="activity-text">Archivo de ventas "Diciembre_2025.csv" procesado con éxito.</div>
                    <div className="activity-time">Hoy, 14:30</div>
                  </div>
                  <div className="activity-item">
                    <div className="activity-text">Actualización de Metas 2026 sincronizada desde Google Sheets.</div>
                    <div className="activity-time">Ayer, 09:15</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSection === 'chats' && (
            <div className="card chat-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2>💬 Asistente Alquimia Datalive</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <button onClick={handleClearChat} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f7fafc', color: '#666', border: '1px solid #e2e8f0' }}>
                    Limpiar
                  </button>
                  <select
                    value={`${modelConfig.provider}:${modelConfig.modelId}`}
                    onChange={(e) => {
                      const [provider, modelId] = e.target.value.split(':');
                      setModelConfig({ provider, modelId });
                    }}
                    className="glass-select"
                  >
                    {availableModels.map(model => (
                      <option key={model.id} value={`${model.provider}:${model.id}`}>{model.icon} {model.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="chat-container">
                <div className="chat-messages">
                  {chatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '60px' }}>
                      <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>👋 ¿Cómo puedo ayudarte hoy?</p>
                      <p>Consulta sobre ventas, márgenes o metas directamente.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`message ${msg.role}`}>
                        <div className="message-role">
                          {msg.role === 'user' ? 'Tú' : '🤖 Datalive AI'}
                          {msg.toolsUsed && <span className="badge" style={{ marginLeft: '10px' }}>{msg.toolsUsed[0]}</span>}
                        </div>
                        <div className="message-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          {msg.role === 'assistant' && (
                            <button className="copy-button" onClick={() => copyToClipboard(msg.content)}>📋 Copiar para WhatsApp</button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {loading && <div className="message assistant"><div className="loading">Consultando bases de datos...</div></div>}
                  <div ref={messagesEndRef} />
                </div>

                <div className="chat-input">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Escribe tu consulta..."
                    disabled={loading}
                  />
                  <button onClick={handleSendMessage} disabled={loading || !inputMessage.trim()}>
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'data' && (
            <div className="grid">
              <div className="card" style={{ gridColumn: '1/-1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2>📦 Registro de Ventas (Supabase)</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button
                      onClick={() => document.getElementById('data-file-upload').click()}
                      style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      🚀 Subir CSV
                    </button>
                    <input
                      id="data-file-upload"
                      type="file"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                      accept=".csv"
                    />
                    <div className="pagination">
                      <button onClick={() => loadVentas(currentPage - 1)} disabled={currentPage === 1}>←</button>
                      <span>Pág {currentPage} de {totalPages}</span>
                      <button onClick={() => loadVentas(currentPage + 1)} disabled={currentPage === totalPages}>→</button>
                    </div>
                  </div>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Día</th><th>Canal</th><th>Marca</th><th>Modelo</th><th>Q</th><th>Ingreso</th><th>Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map((venta, idx) => (
                        <tr key={idx}>
                          <td>{venta.dia}</td>
                          <td>{venta.canal}</td>
                          <td>{venta.marca}</td>
                          <td style={{ fontSize: '0.7rem' }}>{venta.modelo}</td>
                          <td>{venta.cantidad}</td>
                          <td>${formatNumber(venta.ingreso_neto)}</td>
                          <td style={{ color: venta.margen >= 0 ? 'green' : 'red' }}>${formatNumber(venta.margen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card" style={{ gridColumn: '1/-1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2>📈 Tablas de Soporte (Google Sheets)</h2>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['Metas', 'Forecast', 'Comisiones'].map(sheet => (
                      <button
                        key={sheet}
                        onClick={() => { setActiveSheet(sheet); loadSheetsData(sheet); }}
                        style={{ background: activeSheet === sheet ? '#667eea' : '#f7fafc', color: activeSheet === sheet ? 'white' : '#666', border: '1px solid #e2e8f0', padding: '6px 12px', fontSize: '0.8rem' }}
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
                        <tr>{Object.keys(sheetsData[0]).map((h, i) => <th key={i}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {sheetsData.slice(0, 30).map((row, i) => (
                          <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{v}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="loading">Cargando datos de Sheets...</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
