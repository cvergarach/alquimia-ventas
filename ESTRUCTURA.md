# 📁 Estructura del Proyecto - Alquimia Datalive MVP

```
alquimia-mvp/
│
├── 📄 README.md                    # Documentación completa
├── 📄 SETUP_RAPIDO.md             # Guía rápida de configuración
├── 📄 .gitignore                  # Archivos a ignorar en Git
├── 📄 render.yaml                 # Configuración para Render
├── 📄 vercel.json                 # Configuración para Vercel
├── 📄 ejemplo_upload.csv          # CSV de ejemplo para testing
│
├── 📂 backend/                    # 🔧 BACKEND (Node.js + Express + MCP)
│   ├── 📄 package.json            # Dependencias del backend
│   ├── 📄 .env.example            # Plantilla de variables de entorno
│   ├── 📄 server.js               # ⭐ Servidor principal Express
│   ├── 📄 mcp-supabase.js         # 🔌 MCP Server para Supabase
│   ├── 📄 mcp-sheets.js           # 🔌 MCP Server para Google Sheets
│   └── 📄 supabase_schema.sql     # Script SQL para crear tabla
│
├── 📂 frontend/                   # 🎨 FRONTEND (React + Vite)
│   ├── 📄 package.json            # Dependencias del frontend
│   ├── 📄 vite.config.js          # Configuración de Vite
│   ├── 📄 index.html              # HTML principal
│   │
│   └── 📂 src/
│       ├── 📄 main.jsx            # Entry point de React
│       ├── 📄 App.jsx             # ⭐ Componente principal
│       └── 📄 index.css           # Estilos globales
│
└── 📂 google-sheets-data/         # 📊 Datos sintéticos para Google Sheets
    ├── 📄 metas.csv               # Metas mensuales por marca/sucursal
    ├── 📄 forecast.csv            # Forecast de ventas
    ├── 📄 comisiones.csv          # Comisiones por modelo
    └── 📄 catalogo.csv            # Catálogo de productos
```

---

## 🔍 Descripción de Archivos Clave

### Backend

#### `server.js` - Servidor Principal
- Express API con endpoints REST
- Integración con Gemini 2.5 Flash
- Llamadas a MCP Servers (Supabase + Sheets)
- Upload de archivos CSV
- CORS configurado para Vercel

**Endpoints principales:**
- `GET /health` - Health check
- `POST /api/chat` - Chat con IA
- `GET /api/ventas` - Obtener ventas de Supabase
- `GET /api/sheets/:sheetName` - Obtener datos de Google Sheets
- `POST /api/upload-csv` - Subir archivo CSV

#### `mcp-supabase.js` - MCP Server para Supabase
Herramientas disponibles:
- `query_ventas` - Consultar ventas con filtros
- `aggregate_ventas` - Agrupar datos por dimensiones
- `get_top_productos` - Top productos por criterio
- `insert_ventas` - Insertar registros

#### `mcp-sheets.js` - MCP Server para Google Sheets
Herramientas disponibles:
- `query_metas` - Consultar metas mensuales
- `get_forecast` - Obtener forecast de ventas
- `get_comisiones` - Tabla de comisiones
- `get_catalogo` - Catálogo de productos
- `list_sheets` - Listar hojas disponibles

### Frontend

#### `App.jsx` - Componente Principal
Funcionalidades:
- **Dashboard de datos**: Tablas de Supabase y Google Sheets
- **Chat con IA**: Interfaz conversacional con Gemini
- **Upload CSV**: Carga masiva de registros
- **Formato chileno**: Números con punto y coma
- **Responsive**: Se adapta a diferentes pantallas

Hooks principales:
- `useState` para estado local (ventas, sheets, chat)
- `useEffect` para carga inicial de datos
- `axios` para llamadas HTTP

### Configuración

#### `.env` Variables de Entorno

**Backend:**
```bash
SUPABASE_URL=              # URL del proyecto Supabase
SUPABASE_ANON_KEY=         # API Key pública de Supabase
GEMINI_API_KEY=            # API Key de Google Gemini
GOOGLE_CLIENT_EMAIL=       # Email del Service Account
GOOGLE_PRIVATE_KEY=        # Private key del Service Account
GOOGLE_SHEET_ID=           # ID del Google Sheet
PORT=3001                  # Puerto del servidor
FRONTEND_URL=              # URL del frontend para CORS
```

**Frontend:**
```bash
VITE_API_URL=              # URL del backend
```

---

## 🔄 Flujo de Datos

### 1. Consulta de Chat

```
Usuario escribe pregunta
    ↓
Frontend → POST /api/chat
    ↓
Backend detecta herramientas necesarias
    ↓
Llama a MCP Servers (Supabase/Sheets)
    ↓
Obtiene datos
    ↓
Envía contexto a Gemini 2.5 Flash
    ↓
Gemini analiza y responde
    ↓
Frontend muestra respuesta
```

### 2. Upload de CSV

```
Usuario selecciona archivo CSV
    ↓
Frontend → POST /api/upload-csv (multipart/form-data)
    ↓
Backend parsea CSV con csv-parser
    ↓
Convierte formato chileno (punto/coma)
    ↓
Inserta en Supabase
    ↓
Frontend recarga datos
```

### 3. Visualización de Datos

```
Frontend carga página
    ↓
useEffect() se ejecuta
    ↓
GET /api/ventas (Supabase)
GET /api/sheets/Metas (Google Sheets)
    ↓
Backend consulta fuentes de datos
    ↓
Retorna JSON
    ↓
Frontend renderiza tablas
```

---

## 🎨 Componentes de UI

### Header
- Título y descripción
- Estadísticas (cantidad de ventas y registros)

### Upload Card
- Input de archivo
- Botón de upload
- Mensajes de estado (success/error/loading)

### Tablas de Datos
**Tabla Supabase:**
- DIA, CANAL, MARCA, MODELO, CANTIDAD, INGRESO, MARGEN
- Scroll vertical
- Margen coloreado (verde/rojo)
- Formato numérico chileno

**Tabla Google Sheets:**
- Tabs para cambiar entre hojas (Metas, Forecast, Comisiones, Catalogo)
- Columnas dinámicas según la hoja
- Scroll vertical

### Chat Interface
- Lista de mensajes (user/assistant)
- Indicador de herramientas MCP usadas
- Input con auto-envío (Enter)
- Estado de carga
- Scroll automático al último mensaje

---

## 📊 Modelo de Datos

### Supabase: Tabla `ventas`

```sql
CREATE TABLE ventas (
  id BIGSERIAL PRIMARY KEY,
  dia DATE NOT NULL,
  canal VARCHAR(100),
  sku VARCHAR(50),
  cantidad INTEGER DEFAULT 0,
  adquisicion VARCHAR(50),
  marca VARCHAR(50),
  modelo VARCHAR(200),
  origen VARCHAR(100),
  sucursal VARCHAR(200),
  ingreso_neto DECIMAL(12,2) DEFAULT 0,
  costo_neto DECIMAL(12,2) DEFAULT 0,
  margen DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Google Sheets: 4 Hojas

1. **Metas**: Mes, Marca, Sucursal, Meta_Cantidad, Meta_Ingreso, Alcanzado
2. **Forecast**: Periodo, Marca, Tipo, Forecast_Cantidad, Forecast_Ingreso, Confianza
3. **Comisiones**: Marca, Modelo, Comision_Porcentaje, Comision_Fija, Categoria, Activo
4. **Catalogo**: SKU, Marca, Modelo, Precio_Lista, Precio_Arriendo, Stock_Disponible, Estado

---

## 🚀 Comandos Útiles

### Desarrollo Local

```bash
# Instalar dependencias
cd backend && npm install
cd ../frontend && npm install

# Ejecutar en desarrollo
# Terminal 1
cd backend && npm start

# Terminal 2
cd frontend && npm run dev
```

### Deploy

```bash
# Backend (Render se encarga automáticamente al hacer push)
git push origin main

# Frontend (Vercel se encarga automáticamente al hacer push)
git push origin main

# O manual:
cd frontend && npm run build
```

### Testing

```bash
# Verificar backend
curl http://localhost:3001/health

# Ver ventas
curl http://localhost:3001/api/ventas

# Chat
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "¿Cuántas ventas de HONOR?"}'
```

---

## 🔐 Seguridad

### ⚠️ NUNCA SUBIR A GIT:
- ❌ `.env` (variables de entorno)
- ❌ Archivos JSON de Google Service Account
- ❌ API Keys en código
- ❌ `node_modules/`

### ✅ Buenas Prácticas:
- ✅ Usar `.env.example` como template
- ✅ Variables de entorno en Render/Vercel
- ✅ `.gitignore` configurado
- ✅ CORS limitado a frontend URL
- ✅ RLS (Row Level Security) en Supabase

---

## 📈 Métricas del Proyecto

**Backend:**
- 1 servidor Express
- 2 MCP Servers
- 5 endpoints REST
- 9 herramientas MCP

**Frontend:**
- 1 componente principal
- 4 vistas de datos
- 1 interfaz de chat
- Responsive design

**Líneas de código:**
- Backend: ~800 líneas
- Frontend: ~500 líneas
- Total: ~1,300 líneas

---

## 🎯 Próximas Mejoras

**Corto plazo:**
- [ ] Autenticación de usuarios
- [ ] Gráficos con Recharts
- [ ] Exportar a Excel
- [ ] Notificaciones en tiempo real

**Mediano plazo:**
- [ ] Más fuentes de datos (Salesforce, Slack)
- [ ] Dashboard personalizable
- [ ] Reportes programados
- [ ] Mobile app (React Native)

**Largo plazo:**
- [ ] Machine Learning para predicciones
- [ ] Integración con ERPs
- [ ] Multi-tenancy
- [ ] API pública

---

¡Proyecto completo y listo para usar! 🚀
