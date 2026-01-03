import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import Login from './Login'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import './index.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
console.log('Alquimia API URL:', API_URL)

// Searchable Select Component
function SearchableSelect({ label, value, onChange, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const displayValue = value || placeholder

  return (
    <div className="searchable-select" ref={dropdownRef}>
      <label>{label}</label>
      <div className="select-trigger" onClick={() => setIsOpen(!isOpen)} title={value || placeholder}>
        <span className={value ? '' : 'placeholder'}>{displayValue}</span>
        <span className="arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className="select-dropdown">
          <input
            type="text"
            className="select-search"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <div className="select-options">
            <div
              className="select-option"
              onClick={() => {
                onChange('')
                setIsOpen(false)
                setSearchTerm('')
              }}
            >
              <em>Todos</em>
            </div>
            {filteredOptions.map((opt, idx) => (
              <div
                key={idx}
                className="select-option"
                title={opt}
                onClick={() => {
                  onChange(opt)
                  setIsOpen(false)
                  setSearchTerm('')
                }}
              >
                {opt}
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div className="select-option disabled">No se encontraron resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

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
  const [modelConfig, setModelConfig] = useState({ provider: 'gemini', modelId: 'gemini-1.5-flash' })
  const [kpis, setKpis] = useState({ total_unidades: 0, total_ingreso: 0, total_margen: 0, margenPct: 0 })
  const [chartsData, setChartsData] = useState({ trend: [], channels: [], brands: [] })
  const [activeSection, setActiveSection] = useState('dashboard') // dashboard, chats, data
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [filters, setFilters] = useState({ canal: '', marca: '', sucursal: '', fecha_inicio: '', fecha_fin: '' })
  const [filterOptions, setFilterOptions] = useState({ canales: [], marcas: [], sucursales: [] })
  const [managedTools, setManagedTools] = useState([])
  const [editingTool, setEditingTool] = useState(null)
  const [magicPrompt, setMagicPrompt] = useState('')
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicModel, setMagicModel] = useState('gemini-1.5-pro')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [managedUsers, setManagedUsers] = useState([])
  const [newUser, setNewUser] = useState({
    username: '', password: '', email: '', first_name: '', last_name: '', phone: ''
  })
  const messagesEndRef = useRef(null)

  // ... (availableModels setup)

  useEffect(() => {
    // Verificar sesión al cargar
    const savedUser = localStorage.getItem('alquimia_user')
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser))
      setIsLoggedIn(true)
    }

    if (activeSection === 'settings') {
      fetchManagedTools()
    }
    if (activeSection === 'users') {
      fetchManagedUsers()
    }
  }, [activeSection])

  const handleLoginSuccess = (userData) => {
    setCurrentUser(userData)
    setIsLoggedIn(true)
    localStorage.setItem('alquimia_user', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setIsLoggedIn(false)
    localStorage.removeItem('alquimia_user')
  }

  const fetchManagedUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/users`)
      if (response.data.success) {
        setManagedUsers(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const handleCreateUser = async () => {
    try {
      const response = await axios.post(`${API_URL}/api/users`, newUser)
      if (response.data.success) {
        setManagedUsers([response.data.data, ...managedUsers])
        setNewUser({ username: '', password: '', email: '', first_name: '', last_name: '', phone: '' })
        alert('Usuario creado correctamente')
      }
    } catch (error) {
      console.error('Error creating user:', error)
      alert('Error al crear usuario')
    }
  }

  const handleDeleteUser = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario?')) return
    try {
      const response = await axios.delete(`${API_URL}/api/users/${id}`)
      if (response.data.success) {
        setManagedUsers(managedUsers.filter(u => u.id !== id))
      }
    } catch (error) {
      console.error('Error deleting user:', error)
    }
  }

  const fetchManagedTools = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/settings/tools`)
      if (response.data.success) {
        setManagedTools(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching tools:', error)
    }
  }

  const handleGenerateMagicTool = async () => {
    if (!magicPrompt.trim()) return
    setMagicLoading(true)
    try {
      const response = await axios.post(`${API_URL}/api/settings/generate-tool`, {
        prompt: magicPrompt,
        modelId: magicModel
      })
      if (response.data.success) {
        const newTool = response.data.data
        // Pre-visualizar en el modal de edición
        setEditingTool({
          ...newTool,
          parameters: JSON.stringify(newTool.parameters, null, 2)
        })
        setMagicPrompt('')
      }
    } catch (error) {
      console.error('Error generating magic tool:', error)
      alert('Error al generar la herramienta con IA')
    } finally {
      setMagicLoading(false)
    }
  }

  const handleSaveTool = async (tool) => {
    try {
      // Limpiar payload para evitar errores en Supabase
      const { created_at, ...cleanTool } = tool
      const payload = { ...cleanTool }

      if (typeof payload.parameters === 'string') {
        try {
          payload.parameters = JSON.parse(payload.parameters)
        } catch (e) {
          alert('Error en el formato JSON de los parámetros')
          return
        }
      }

      const response = await axios.post(`${API_URL}/api/settings/tools`, payload)
      if (response.data.success) {
        setEditingTool(null)
        fetchManagedTools()
        alert('Herramienta guardada con éxito')
      }
    } catch (error) {
      console.error('Error saving tool:', error)
      const msg = error.response?.data?.error || error.message
      alert(`Error al guardar la herramienta: ${msg}`)
    }
  }

  const handleDeleteTool = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta herramienta?')) return
    try {
      const response = await axios.delete(`${API_URL}/api/settings/tools/${id}`)
      if (response.data.success) {
        fetchManagedTools()
      }
    } catch (error) {
      console.error('Error deleting tool:', error)
    }
  }

  const handleToggleTool = async (tool) => {
    handleSaveTool({ ...tool, enabled: !tool.enabled })
  }

  const availableModels = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', icon: '⚡' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', icon: '' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', provider: 'claude', icon: '' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'claude', icon: '' },
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

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="layout-wrapper">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="brand-logo">A</div>
          <span className="brand-name">ALQUIMIA</span>
        </div>

        <nav className="sidebar-nav">
          <div className={`nav-item ${activeSection === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveSection('dashboard'); setIsSidebarOpen(false); }}>
            Dashboard
          </div>
          <div className={`nav-item ${activeSection === 'data' ? 'active' : ''}`} onClick={() => { setActiveSection('data'); setIsSidebarOpen(false); }}>
            Datos
          </div>
          <div className={`nav-item ${activeSection === 'chats' ? 'active' : ''}`} onClick={() => { setActiveSection('chats'); setIsSidebarOpen(false); }}>
            Chat IA
          </div>
          <div className={`nav-item ${activeSection === 'guia' ? 'active' : ''}`} onClick={() => { setActiveSection('guia'); setIsSidebarOpen(false); }}>
            Guía
          </div>

          <div className="sidebar-section-title">Administración</div>
          <div className={`nav-item ${activeSection === 'users' ? 'active' : ''}`} onClick={() => { setActiveSection('users'); setIsSidebarOpen(false); }}>
            Usuarios
          </div>
          <div className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => { setActiveSection('settings'); setIsSidebarOpen(false); }}>
            Configuración
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {currentUser?.first_name?.charAt(0)}{currentUser?.last_name?.charAt(0)}
            </div>
            <div className="user-info">
              <div className="user-name">{currentUser?.first_name} {currentUser?.last_name}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{currentUser?.role}</div>
            </div>
          </div>
          <div className="nav-item" style={{ padding: '8px 0', fontSize: '0.8rem' }} onClick={handleLogout}>
            Cerrar Sesión
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
              <div className="top-bar-subtitle">Dashboard de Análisis de Ventas</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '1.2rem', cursor: 'pointer' }}></div>
          </div>
        </header>

        <div className="content-area">
          {activeSection === 'dashboard' && (
            <>
              {/* Premium Filter Bar */}
              <div className="premium-filter-card">
                <div className="filter-header">
                  <span className="filter-title">Filtros de Análisis</span>
                  <button className="reset-btn" onClick={() => setFilters({ canal: '', marca: '', sucursal: '', fecha_inicio: '', fecha_fin: '' })}>
                    Limpiar Filtros
                  </button>
                </div>
                <div className="filter-grid">
                  <div className="filter-control date-picker-control">
                    <label>Rango de Fechas</label>
                    <div className="modern-date-picker">
                      <div className="date-input-wrapper">
                        <span>Desde</span>
                        <input
                          type="date"
                          className="glass-input modern-date"
                          value={filters.fecha_inicio}
                          onChange={(e) => setFilters({ ...filters, fecha_inicio: e.target.value })}
                        />
                      </div>
                      <div className="date-input-wrapper">
                        <span>Hasta</span>
                        <input
                          type="date"
                          className="glass-input modern-date"
                          value={filters.fecha_fin}
                          onChange={(e) => setFilters({ ...filters, fecha_fin: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>


                  <SearchableSelect
                    label="Canal"
                    value={filters.canal}
                    onChange={(val) => setFilters({ ...filters, canal: val })}
                    options={filterOptions.canales}
                    placeholder="Todos los Canales"
                  />

                  <SearchableSelect
                    label="Marca"
                    value={filters.marca}
                    onChange={(val) => setFilters({ ...filters, marca: val })}
                    options={filterOptions.marcas}
                    placeholder="Todas las Marcas"
                  />

                  <SearchableSelect
                    label="Sucursal"
                    value={filters.sucursal}
                    onChange={(val) => setFilters({ ...filters, sucursal: val })}
                    options={filterOptions.sucursales}
                    placeholder="Todas las Sucursales"
                  />
                </div>
              </div>

              {/* Premium KPI Summary */}
              <div className="dashboard-summary">
                <div className="kpi-card glassmorphism">
                  <div className="kpi-card-content">
                    <span className="kpi-label">Total Unidades</span>
                    <div className="kpi-value">{formatNumber(kpis.total_unidades)}</div>
                    <div className="trend-badge trend-up">+0% hoy</div>
                  </div>
                </div>

                <div className="kpi-card glassmorphism highlighted">
                  <div className="kpi-card-content">
                    <span className="kpi-label">Ingreso Bruto</span>
                    <div className="kpi-value">{formatCurrency(kpis.total_ingreso)}</div>
                    <div className="trend-badge trend-up">+0% hoy</div>
                  </div>
                </div>

                <div className="kpi-card glassmorphism">
                  <div className="kpi-card-content">
                    <span className="kpi-label">Costo total</span>
                    <div className="kpi-value">{formatCurrency(kpis.total_costo)}</div>
                    <div className="trend-badge trend-up">+0% hoy</div>
                  </div>
                </div>

                <div className="kpi-card glassmorphism">
                  <div className="kpi-card-content">
                    <span className="kpi-label">Margen Neto</span>
                    <div className="kpi-value">{formatCurrency(kpis.total_margen)}</div>
                    <div className="trend-badge trend-up">+0% hoy</div>
                  </div>
                </div>

                <div className="kpi-card glassmorphism">
                  <div className="kpi-card-content">
                    <span className="kpi-label">Eficiencia (Mgn%)</span>
                    <div className="kpi-value">{kpis.margenPct.toFixed(1)}%</div>
                    <div className="trend-badge trend-up">+0% hoy</div>
                  </div>
                </div>
              </div>

              {/* Charts & Widgets */}
              <div className="grid">
                <div className="card chart-card wide">
                  <div className="card-header">
                    <h2>Tendencia de Ventas</h2>
                  </div>
                  <div className="chart-wrapper" style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartsData.trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(str) => str ? str.split('-').slice(1).reverse().join('/') : ''}
                        />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="var(--secondary)"
                          strokeWidth={4}
                          dot={{ r: 4, fill: 'var(--secondary)', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
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
                <h2>Asistente Alquimia</h2>
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
                      <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>¿Cómo puedo ayudarte hoy?</p>
                      <p>Consulta sobre ventas, márgenes o metas directamente.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`message ${msg.role}`}>
                        <div className="message-role">
                          {msg.role === 'user' ? 'Tú' : 'Alquimia AI'}
                          {msg.toolsUsed && <span className="badge" style={{ marginLeft: '10px' }}>{msg.toolsUsed[0]}</span>}
                        </div>
                        <div className="message-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          {msg.role === 'assistant' && (
                            <button className="copy-button" onClick={() => copyToClipboard(msg.content)}>Copiar para WhatsApp</button>
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
                  <h2>Registro de Ventas (Supabase)</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button
                      onClick={() => document.getElementById('data-file-upload').click()}
                      style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      Subir CSV
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
                  <h2>Tablas de Soporte (Google Sheets)</h2>
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
          {activeSection === 'settings' && (
            <div className="card settings-section">
              <div className="magic-creator-card" style={{ background: 'rgba(102, 126, 234, 0.05)', padding: '24px', borderRadius: '16px', border: '1px dashed #667eea', marginBottom: '30px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>Alquimia Magic Creator</h3>
                <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '4px' }}>Describe la nueva capacidad y la IA construirá la herramienta por ti.</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="glass-input"
                    style={{ flex: 1, minWidth: '300px' }}
                    placeholder="Ej: Quiero ver el top 5 de productos con más margen..."
                    value={magicPrompt}
                    onChange={(e) => setMagicPrompt(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleGenerateMagicTool()}
                  />
                  <select
                    value={magicModel}
                    onChange={(e) => setMagicModel(e.target.value)}
                    className="glass-input"
                    style={{ width: 'auto' }}
                  >
                    {availableModels.map(m => (
                      <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
                    ))}
                  </select>
                  <button onClick={handleGenerateMagicTool} disabled={magicLoading}>
                    {magicLoading ? 'Generando...' : 'Crear con IA'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Herramientas Instaladas</h2>
                <button className="secondary" onClick={() => setEditingTool({ name: '', description: '', parameters: '{}', sql_template: '', provider: 'supabase', enabled: true })}>
                  + Manual
                </button>
              </div>

              <div className="table-container">
                <table className="settings-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Descripción</th>
                      <th>Proveedor</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedTools.map(tool => (
                      <tr key={tool.id}>
                        <td style={{ fontWeight: 'bold' }}>{tool.name}</td>
                        <td style={{ fontSize: '0.8rem', maxWidth: '300px' }}>{tool.description}</td>
                        <td>{tool.provider}</td>
                        <td>
                          <span className={`badge ${tool.enabled ? 'success' : 'error'}`} onClick={() => handleToggleTool(tool)} style={{ cursor: 'pointer' }}>
                            {tool.enabled ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="small-btn" onClick={() => setEditingTool({ ...tool, parameters: JSON.stringify(tool.parameters, null, 2) })}>Editar</button>
                            <button className="small-btn error" onClick={() => handleDeleteTool(tool.id)}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editingTool && (
                <div className="modal-overlay">
                  <div className="modal-card">
                    <h3>{editingTool.id ? 'Editar' : 'Nueva'} Herramienta</h3>
                    <div className="form-group">
                      <label>Nombre de la Función</label>
                      <input
                        type="text"
                        value={editingTool.name}
                        onChange={(e) => setEditingTool({ ...editingTool, name: e.target.value })}
                        placeholder="ej: get_custom_stats"
                      />
                    </div>
                    <div className="form-group">
                      <label>Descripción para la IA</label>
                      <textarea
                        rows="3"
                        value={editingTool.description}
                        onChange={(e) => setEditingTool({ ...editingTool, description: e.target.value })}
                        placeholder="Explica qué hace y cuándo usarla..."
                      />
                    </div>
                    <div className="form-group">
                      <label>Plantilla SQL (Opcional para Supabase)</label>
                      <textarea
                        rows="4"
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#f8fafc' }}
                        value={editingTool.sql_template || ''}
                        onChange={(e) => setEditingTool({ ...editingTool, sql_template: e.target.value })}
                        placeholder="SELECT ... FROM ventas WHERE canal = {{canal}}"
                      />
                    </div>
                    <div className="form-group">
                      <label>Parámetros (JSON Schema)</label>
                      <textarea
                        rows="3"
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                        value={editingTool.parameters}
                        onChange={(e) => setEditingTool({ ...editingTool, parameters: e.target.value })}
                        placeholder='{"type": "object", "properties": {...}}'
                      />
                    </div>
                    <div className="form-group">
                      <label>Proveedor</label>
                      <select
                        value={editingTool.provider}
                        onChange={(e) => setEditingTool({ ...editingTool, provider: e.target.value })}
                      >
                        <option value="supabase">Supabase (SQL)</option>
                        <option value="sheets">Google Sheets</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                      <button className="primary" onClick={() => handleSaveTool(editingTool)}>Guardar y Activar</button>
                      <button className="secondary" onClick={() => setEditingTool(null)}>Cancelar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'guia' && (
            <div className="card guide-section">
              <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', color: '#0f172a' }}>Guía de Alquimia</h1>
                <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '40px' }}>
                  Todo lo que necesitas saber para aprovechar al máximo tu dashboard inteligente
                </p>

                {/* Introducción */}
                <section style={{ marginBottom: '50px' }}>
                  <h2 style={{ fontSize: '1.8rem', marginBottom: '15px', color: '#1e293b' }}>¿Qué es Alquimia?</h2>
                  <p style={{ lineHeight: '1.8', color: '#475569', marginBottom: '15px' }}>
                    Alquimia es un <strong>dashboard inteligente de análisis de ventas</strong> diseñado para jefes de canal y gerentes comerciales.
                    Combina visualización de datos en tiempo real con inteligencia artificial conversacional para tomar decisiones estratégicas basadas en datos.
                  </p>
                </section>

                {/* Funcionalidades */}
                <section style={{ marginBottom: '50px' }}>
                  <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: '#1e293b' }}>Funcionalidades Principales</h2>

                  <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '12px', color: '#0f172a' }}>1. Dashboard Visual Interactivo</h3>
                    <p style={{ lineHeight: '1.8', color: '#475569', marginBottom: '12px' }}>
                      Muestra métricas clave (KPIs) de ventas en tarjetas visuales y presenta gráficos de tendencias, canales y marcas.
                      Se actualiza automáticamente cuando aplicas filtros.
                    </p>
                    <ul style={{ marginLeft: '20px', lineHeight: '1.8', color: '#475569' }}>
                      <li><strong>Total Unidades:</strong> Cuántos productos se vendieron</li>
                      <li><strong>Ingreso Bruto:</strong> Cuánto dinero entró</li>
                      <li><strong>Costo Total:</strong> Cuánto costó vender esos productos</li>
                      <li><strong>Margen Neto:</strong> La ganancia real</li>
                    </ul>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '12px', color: '#0f172a' }}>2. Sistema de Filtros Avanzado</h3>
                    <p style={{ lineHeight: '1.8', color: '#475569', marginBottom: '12px' }}>
                      Te permite "cortar" los datos para ver solo lo que te interesa. Los filtros son <strong>buscables</strong> - puedes escribir para encontrar rápido.
                    </p>
                    <ul style={{ marginLeft: '20px', lineHeight: '1.8', color: '#475569' }}>
                      <li><strong>Rango de fechas:</strong> Analiza períodos específicos</li>
                      <li><strong>Canal:</strong> E-commerce, tiendas, distribuidores, etc.</li>
                      <li><strong>Marca:</strong> Apple, Samsung, Xiaomi, etc.</li>
                      <li><strong>Sucursal:</strong> Cualquiera de tus +100 sucursales</li>
                    </ul>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '12px', color: '#0f172a' }}>3. Chat con Inteligencia Artificial</h3>
                    <p style={{ lineHeight: '1.8', color: '#475569', marginBottom: '12px' }}>
                      Respondes preguntas en lenguaje natural sobre tus ventas. El AI analiza tus datos y te da insights ejecutivos.
                    </p>
                    <div style={{ background: 'white', padding: '16px', borderRadius: '8px', marginTop: '12px', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontWeight: '600', marginBottom: '8px', color: '#0f172a' }}>Ejemplos de preguntas:</p>
                      <ul style={{ marginLeft: '20px', lineHeight: '1.8', color: '#475569' }}>
                        <li>"¿Cómo voy hoy?"</li>
                        <li>"Qué canal vende más"</li>
                        <li>"Productos menos vendidos en E-commerce"</li>
                        <li>"Top 10 SKUs del mes"</li>
                        <li>"Análisis de rentabilidad por marca"</li>
                      </ul>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '12px', color: '#0f172a' }}>4. Carga Masiva de Datos (CSV)</h3>
                    <p style={{ lineHeight: '1.8', color: '#475569', marginBottom: '12px' }}>
                      Importa miles de registros de ventas desde un archivo Excel/CSV. Procesa automáticamente formatos chilenos ($1.234,56)
                      y normaliza nombres de columnas.
                    </p>
                    <p style={{ lineHeight: '1.8', color: '#475569' }}>
                      <strong>Capacidad:</strong> Maneja más de 55,000 registros sin problemas, insertando datos en lotes paralelos para máxima velocidad.
                    </p>
                  </div>
                </section>

                {/* Casos de Uso */}
                <section style={{ marginBottom: '50px' }}>
                  <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: '#1e293b' }}>Casos de Uso Reales</h2>

                  <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '12px', color: '#0f172a' }}>Caso 1: Monitoreo Diario</h3>
                    <p style={{ lineHeight: '1.8', marginBottom: '12px', color: '#475569' }}>
                      Es lunes 8:00 AM. El jefe de canal quiere saber cómo fue el fin de semana.
                    </p>
                    <ol style={{ marginLeft: '20px', lineHeight: '1.8', color: '#475569' }}>
                      <li>Abre Alquimia y ve dashboard con totales del fin de semana</li>
                      <li>Pregunta al AI: "¿Cómo fue el sábado vs domingo?"</li>
                      <li>AI compara y muestra que sábado vendió 30% más</li>
                      <li>Toma acción basada en insights</li>
                    </ol>
                    <p style={{ marginTop: '12px', fontWeight: '600', color: '#0f172a' }}>Tiempo total: 3 minutos</p>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '12px', color: '#0f172a' }}>Caso 2: Análisis de Campaña</h3>
                    <p style={{ lineHeight: '1.8', marginBottom: '12px', color: '#475569' }}>
                      Marketing lanzó campaña de iPhone. ¿Funcionó?
                    </p>
                    <ol style={{ marginLeft: '20px', lineHeight: '1.8', color: '#475569' }}>
                      <li>Filtra: Marca=Apple, Fecha=última semana</li>
                      <li>Ve que unidades subieron 50%</li>
                      <li>Pregunta: "¿En qué canal se vendió más iPhone?"</li>
                      <li>AI responde con desglose detallado</li>
                    </ol>
                    <p style={{ marginTop: '12px', fontWeight: '600', color: '#0f172a' }}>Insight: La campaña funcionó, especialmente en E-commerce</p>
                  </div>
                </section>

                {/* Tips y Mejores Prácticas */}
                <section style={{ marginBottom: '50px' }}>
                  <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: '#1e293b' }}>Tips y Mejores Prácticas</h2>

                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#0f172a' }}>Tip: Usa filtros combinados</p>
                    <p style={{ lineHeight: '1.8', color: '#475569' }}>
                      Combina múltiples filtros para análisis profundos. Ejemplo: "Ventas de iPhone en E-commerce en Santiago durante Black Friday"
                    </p>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#0f172a' }}>Tip: Búsqueda inteligente</p>
                    <p style={{ lineHeight: '1.8', color: '#475569' }}>
                      Con +100 sucursales, usa la búsqueda. Escribe "Puente" y aparecerá "CAC Puente Alto" instantáneamente.
                    </p>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#0f172a' }}>Tip: Sé específico con el AI</p>
                    <p style={{ lineHeight: '1.8', color: '#475569' }}>
                      En lugar de "productos menos vendidos", prueba "productos de E-commerce del 6 de enero ordenados por cantidad ascendente"
                    </p>
                  </div>
                </section>

                {/* Soporte */}
                <section style={{ background: '#f8fafc', padding: '30px', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '15px', color: '#0f172a' }}>¿Necesitas ayuda?</h2>
                  <p style={{ lineHeight: '1.8', color: '#475569', marginBottom: '20px' }}>
                    Esta guía se actualiza automáticamente con cada nueva funcionalidad. Si tienes preguntas específicas,
                    prueba preguntarle al AI en la sección de Chat.
                  </p>
                  <button
                    onClick={() => setActiveSection('chats')}
                    style={{ background: '#1e40af', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                  >
                    Ir a Chat
                  </button>
                </section>
              </div>
            </div>
          )
          }

          {
            activeSection === 'users' && (
              <div className="card settings-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                  <div>
                    <h2>Gestión de Usuarios</h2>
                    <p style={{ fontSize: '0.9rem', color: '#666' }}>Crea y administra los accesos a la plataforma Alquimia.</p>
                  </div>
                </div>

                <div className="magic-creator-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px', marginBottom: '30px' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Nuevo Usuario</h3>
                  <div className="filter-grid" style={{ gap: '15px' }}>
                    <div className="filter-control">
                      <label>Nombre</label>
                      <input type="text" className="glass-input" value={newUser.first_name} onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })} placeholder="Nombre" />
                    </div>
                    <div className="filter-control">
                      <label>Apellido</label>
                      <input type="text" className="glass-input" value={newUser.last_name} onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })} placeholder="Apellido" />
                    </div>
                    <div className="filter-control">
                      <label>Email</label>
                      <input type="email" className="glass-input" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="correo@ejemplo.com" />
                    </div>
                    <div className="filter-control">
                      <label>Celular</label>
                      <input type="text" className="glass-input" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} placeholder="+56 9..." />
                    </div>
                    <div className="filter-control">
                      <label>Usuario</label>
                      <input type="text" className="glass-input" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} placeholder="nombre.apellido" />
                    </div>
                    <div className="filter-control">
                      <label>Contraseña</label>
                      <input type="password" className="glass-input" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="••••••••" />
                    </div>
                  </div>
                  <button onClick={handleCreateUser} style={{ marginTop: '20px', width: '200px' }}>
                    Crear Usuario
                  </button>
                </div>

                <div className="table-container">
                  <table className="settings-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Usuario</th>
                        <th>Contacto</th>
                        <th>Rol</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managedUsers.map(user => (
                        <tr key={user.id}>
                          <td>{user.first_name} {user.last_name}</td>
                          <td style={{ fontWeight: '600' }}>{user.username}</td>
                          <td style={{ fontSize: '0.8rem' }}>
                            <div>{user.email}</div>
                            <div>{user.phone}</div>
                          </td>
                          <td><span className="badge">{user.role}</span></td>
                          <td>
                            <button className="small-btn error" onClick={() => handleDeleteUser(user.id)}>Eliminar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }
        </div >
      </main >
    </div >
  )
}

export default App
