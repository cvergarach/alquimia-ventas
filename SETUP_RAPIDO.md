# ⚡ Guía Rápida de Setup - Alquimia MVP

## 🎯 Pre-requisitos

- [x] Node.js 18+ instalado
- [x] Cuenta GitHub (para deploy)
- [x] Cuenta Supabase (gratis)
- [x] Cuenta Google Cloud (gratis)
- [x] Cuenta Render (gratis)
- [x] Cuenta Vercel (gratis)
- [x] API Key de Gemini (gratis)

---

## 📋 Checklist de Configuración

### ✅ Paso 1: Supabase (5 min)

1. [ ] Ir a https://supabase.com
2. [ ] Crear proyecto (nombre: `alquimia-mvp`)
3. [ ] Ir a SQL Editor
4. [ ] Copiar y ejecutar: `backend/supabase_schema.sql`
5. [ ] Ir a Settings → API
6. [ ] Copiar:
   - Project URL
   - anon/public key

**Guardar en notas:**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
```

---

### ✅ Paso 2: Google Sheets (10 min)

#### A. Service Account

1. [ ] Ir a https://console.cloud.google.com
2. [ ] Crear proyecto: `alquimia-sheets`
3. [ ] Habilitar API:
   - APIs & Services → Enable APIs
   - Buscar "Google Sheets API"
   - Enable

4. [ ] Crear credenciales:
   - APIs & Services → Credentials
   - Create Credentials → Service Account
   - Nombre: `alquimia-service`
   - Role: Editor
   - Create

5. [ ] Generar key:
   - Click en el Service Account creado
   - Keys → Add Key → Create new key
   - JSON → Create
   - **DESCARGAR ARCHIVO JSON**

6. [ ] Abrir JSON y copiar:
   - `client_email`
   - `private_key` (incluye -----BEGIN y -----END)

**Guardar en notas:**
```
GOOGLE_CLIENT_EMAIL=alquimia-service@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQI...\n-----END PRIVATE KEY-----\n"
```

#### B. Crear Google Sheet

1. [ ] Ir a https://sheets.google.com
2. [ ] Crear nuevo Sheet: "Alquimia Data"
3. [ ] Crear 4 hojas (tabs):
   - Metas
   - Forecast
   - Comisiones
   - Catalogo

4. [ ] Importar datos:
   - Metas: copiar de `google-sheets-data/metas.csv`
   - Forecast: copiar de `google-sheets-data/forecast.csv`
   - Comisiones: copiar de `google-sheets-data/comisiones.csv`
   - Catalogo: copiar de `google-sheets-data/catalogo.csv`

5. [ ] Compartir Sheet:
   - Click "Compartir"
   - Pegar el `GOOGLE_CLIENT_EMAIL`
   - Rol: Lector
   - Enviar

6. [ ] Copiar ID del Sheet:
   ```
   URL: https://docs.google.com/spreadsheets/d/1AbC123XyZ456/edit
   ID: 1AbC123XyZ456
   ```

**Guardar en notas:**
```
GOOGLE_SHEET_ID=1AbC123XyZ456
```

---

### ✅ Paso 3: Gemini API (2 min)

1. [ ] Ir a https://aistudio.google.com/app/apikey
2. [ ] Click "Create API Key"
3. [ ] Copiar la key

**Guardar en notas:**
```
GEMINI_API_KEY=AIzaSy...
```

---

### ✅ Paso 4: Local Setup (5 min)

```bash
# Clonar/descargar proyecto
cd alquimia-mvp

# Backend
cd backend
npm install
cp .env.example .env

# Editar .env con las credenciales guardadas
# nano .env (o tu editor favorito)

# Frontend
cd ../frontend
npm install
echo "VITE_API_URL=http://localhost:3001" > .env

# Iniciar
# Terminal 1:
cd backend && npm start

# Terminal 2:
cd frontend && npm run dev

# Abrir: http://localhost:5173
```

---

### ✅ Paso 5: Deploy Backend - Render (7 min)

1. [ ] Ir a https://render.com
2. [ ] Sign up / Login con GitHub
3. [ ] New → Web Service
4. [ ] Connect repository (autorizar acceso)
5. [ ] Configurar:
   - **Name**: `alquimia-backend`
   - **Region**: Oregon (US West)
   - **Branch**: main
   - **Root Directory**: (dejar vacío)
   - **Runtime**: Node
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free

6. [ ] Environment Variables (Add from .env):
   ```
   NODE_ENV=production
   PORT=3001
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...
   GEMINI_API_KEY=AIzaSy...
   GOOGLE_CLIENT_EMAIL=alquimia-service@...
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
   GOOGLE_SHEET_ID=1AbC123XyZ456
   FRONTEND_URL=https://alquimia-mvp.vercel.app
   ```

7. [ ] Create Web Service
8. [ ] Esperar deploy (~3 min)
9. [ ] Copiar URL generada: `https://alquimia-backend.onrender.com`

---

### ✅ Paso 6: Deploy Frontend - Vercel (5 min)

1. [ ] Ir a https://vercel.com
2. [ ] Sign up / Login con GitHub
3. [ ] Import Project
4. [ ] Seleccionar repo
5. [ ] Configurar:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

6. [ ] Environment Variables:
   ```
   VITE_API_URL=https://alquimia-backend.onrender.com
   ```

7. [ ] Deploy
8. [ ] Copiar URL: `https://alquimia-mvp.vercel.app`

9. [ ] Volver a Render:
   - Environment Variables
   - Editar `FRONTEND_URL`
   - Cambiar a: `https://alquimia-mvp.vercel.app`
   - Guardar
   - Redeploy

---

## ✅ Verificación Final

1. [ ] Abrir app en navegador
2. [ ] Ver tabla de Supabase con datos
3. [ ] Ver tabs de Google Sheets (Metas, Forecast, etc.)
4. [ ] Probar chat: "¿Cuántas ventas de HONOR tenemos?"
5. [ ] Subir CSV de prueba (`ejemplo_upload.csv`)
6. [ ] Verificar que se insertaron registros

---

## 🎉 ¡Listo!

Tu MVP está funcionando. Ahora puedes:

- 💬 Conversar con tus datos
- 📊 Ver ventas en tiempo real
- 📈 Comparar con metas y forecast
- 📤 Cargar más datos vía CSV

---

## 🆘 Si algo falla

**Backend no arranca:**
```bash
cd backend
npm install
node server.js
# Ver errores en consola
```

**Frontend no conecta:**
- Verificar que `VITE_API_URL` esté correcto
- Abrir DevTools → Network → ver requests

**Google Sheets no funciona:**
- Verificar que Service Account tiene acceso
- Verificar que API está habilitada
- Verificar formato de PRIVATE_KEY (con \n literales)

**Render/Vercel no deployan:**
- Verificar logs de build
- Verificar environment variables
- Verificar que package.json tiene scripts correctos

---

## 📞 Contacto

¿Dudas? Escríbeme a Cesar - Alquimia Datalive
