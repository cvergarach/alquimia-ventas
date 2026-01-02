# 🚀 Alquimia Datalive - MVP

Sistema de análisis conversacional de datos con IA usando **MCP (Model Context Protocol)**, **Multi-Model Support (Gemini + Claude)**, **Supabase** y **Google Sheets**.

## 📋 Características

- ✅ **Chat con IA**: Consulta tus datos en lenguaje natural
- ✅ **MCP Integration**: Conecta múltiples fuentes de datos (Supabase + Google Sheets)
- ✅ **Upload CSV**: Carga registros masivos desde archivos
- ✅ **Visualización**: Tablas interactivas de ventas y métricas
- ✅ **Formato Chileno**: Números con punto (miles) y coma (decimales)

## 🏗️ Arquitectura

```
React (Vercel)
    ↓
Express API (Render)
    ↓
Multi-Model AI Orchestrator
    ├→ Google Gemini (Pro/Flash)
    ├→ Anthropic Claude (Opus/Sonnet/Haiku)
    ↓
MCP Integration
    ├→ Supabase (ventas)
    └→ Google Sheets (metas, forecast, comisiones, catálogo)
```

## 📦 Stack Tecnológico

### Backend
- Node.js + Express
- MCP SDK (@modelcontextprotocol/sdk)
- Supabase Client
- Google APIs (Sheets)
- Gemini AI (@google/generative-ai)
- Anthropic Claude (@anthropic-ai/sdk)

### Frontend
- React + Vite
- Axios
- CSS vanilla (responsive)

## 🚀 Configuración Paso a Paso

### 1. Configurar Supabase

1. Crear cuenta en [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. En SQL Editor, ejecutar el script: `backend/supabase_schema.sql`
4. Copiar:
   - Project URL → `SUPABASE_URL`
   - Anon/Public Key → `SUPABASE_ANON_KEY`

### 2. Configurar Google Sheets

#### A. Crear Service Account

1. Ir a [Google Cloud Console](https://console.cloud.google.com)
2. Crear nuevo proyecto
3. Habilitar **Google Sheets API**
4. Crear credenciales → Service Account
5. Descargar JSON de credenciales
6. Copiar del JSON:
   - `client_email` → `GOOGLE_CLIENT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`

#### B. Crear y Configurar Google Sheet

1. Crear nuevo Google Sheet
2. Crear 4 hojas (tabs):
   - **Metas**
   - **Forecast**
   - **Comisiones**
   - **Catalogo**

3. Importar datos desde los CSVs en `google-sheets-data/`:
   - Metas: copiar contenido de `metas.csv`
   - Forecast: copiar contenido de `forecast.csv`
   - Comisiones: copiar contenido de `comisiones.csv`
   - Catalogo: copiar contenido de `catalogo.csv`

4. Compartir el Sheet:
   - Click en "Compartir"
   - Agregar el `GOOGLE_CLIENT_EMAIL` con permisos de **Lector**

5. Copiar el ID del Sheet de la URL:
   ```
   https://docs.google.com/spreadsheets/d/1AbC123XyZ456/edit
                                      ↑ este ID ↑
   ```
   → `GOOGLE_SHEET_ID`

### 3. Configurar Gemini API

1. Ir a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crear API Key
3. Copiar → `GEMINI_API_KEY`

### 4. Configurar Backend

```bash
cd backend
npm install
cp .env.example .env
```

Editar `.env` con tus credenciales:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
GEMINI_API_KEY=AIzaSy...
ANTHROPIC_API_KEY=sk-ant-api03...
GOOGLE_CLIENT_EMAIL=alquimia@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=1AbC123XyZ456
PORT=3001
FRONTEND_URL=http://localhost:5173
```

**IMPORTANTE para GOOGLE_PRIVATE_KEY:**
- Debe incluir las comillas
- Los `\n` deben estar literalmente (no saltos de línea reales)

### 5. Configurar Frontend

```bash
cd ../frontend
npm install
```

Crear archivo `.env`:

```env
VITE_API_URL=http://localhost:3001
```

### 6. Ejecutar Localmente

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Abrir: http://localhost:5173

## 🌐 Deploy en Producción

### Backend → Render

1. Crear cuenta en [render.com](https://render.com)
2. New → Web Service
3. Conectar repo de GitHub
4. Configurar:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Root Directory: `/`

5. Agregar Environment Variables (todas las del `.env`)

6. Copiar URL generada (ej: `https://alquimia-backend.onrender.com`)

### Frontend → Vercel

1. Crear cuenta en [vercel.com](https://vercel.com)
2. Import Project
3. Configurar:
   - Root Directory: `frontend`
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

4. Environment Variables:
   ```
   VITE_API_URL=https://alquimia-backend.onrender.com
   ```

5. Deploy!

## 📊 Estructura de Datos

### Tabla Supabase: `ventas`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| dia | DATE | Fecha de venta |
| canal | VARCHAR | Canal (E-COMMERCE, CAC, etc.) |
| sku | VARCHAR | SKU del producto |
| cantidad | INTEGER | Unidades vendidas |
| adquisicion | VARCHAR | Tipo (ARRIENDO, VENTA) |
| marca | VARCHAR | Marca del producto |
| modelo | VARCHAR | Modelo |
| origen | VARCHAR | Origen (NUEVO, CAMBIO, etc.) |
| sucursal | VARCHAR | Sucursal |
| ingreso_neto | DECIMAL | Ingreso (formato chileno) |
| costo_neto | DECIMAL | Costo (formato chileno) |
| margen | DECIMAL | Margen (formato chileno) |

### Google Sheets

**Hoja: Metas**
- Mes, Marca, Sucursal, Meta_Cantidad, Meta_Ingreso, Alcanzado

**Hoja: Forecast**
- Periodo, Marca, Tipo, Forecast_Cantidad, Forecast_Ingreso, Confianza

**Hoja: Comisiones**
- Marca, Modelo, Comision_Porcentaje, Comision_Fija, Categoria, Activo

**Hoja: Catalogo**
- SKU, Marca, Modelo, Precio_Lista, Precio_Arriendo, Stock_Disponible, Estado

## 💬 Ejemplos de Consultas

- "¿Cuántas unidades de HONOR vendimos en diciembre?"
- "Muéstrame el top 10 de productos por margen"
- "Compara las ventas reales vs el forecast de SAMSUNG"
- "¿Cuál es la comisión del modelo iPhone 15?"
- "¿Qué productos tienen bajo stock?"
- "Analiza el margen promedio por marca"

## 🔧 Troubleshooting

### Error: "Cannot find module..."
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Error: Google Sheets 403
- Verificar que el Service Account tiene acceso al Sheet
- Verificar que Google Sheets API está habilitada

### Error: Supabase connection
- Verificar URL y API Key
- Verificar que la tabla existe
- Verificar RLS policies

### Error: CORS
- Verificar `FRONTEND_URL` en backend `.env`
- Verificar que ambos servicios están corriendo

## 📝 Próximos Pasos

- [ ] Autenticación de usuarios
- [ ] Más fuentes de datos (Salesforce, Slack, etc.)
- [ ] Gráficos y dashboards
- [ ] Exportar reportes
- [ ] Notificaciones automáticas
- [ ] Mobile app

## 🤝 Contacto

Desarrollado por **Cesar** - Alquimia Datalive  
CTO & Co-Founder

---

⭐ Si te gusta el proyecto, dale una estrella!
