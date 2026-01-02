import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import { google } from 'googleapis';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'https://alquimia-ventas.vercel.app',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    console.log(`[CORS] Request from origin: ${origin}`);
    if (!origin || allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Origin rejected: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Configuración de herramientas para Gemini
const tools = [
  {
    functionDeclarations: [
      {
        name: "query_ventas",
        description: "Consulta datos de ventas con filtros opcionales (canal, marca, sku, sucursal, modelo).",
        parameters: {
          type: "object",
          properties: {
            filters: {
              type: "object",
              properties: {
                dia: { type: "string", description: "Día específico (YYYY-MM-DD)" },
                fecha_inicio: { type: "string", description: "Fecha desde (YYYY-MM-DD)" },
                fecha_fin: { type: "string", description: "Fecha hasta (YYYY-MM-DD)" },
                canal: { type: "string" },
                marca: { type: "string" },
                sku: { type: "string" },
                sucursal: { type: "string" },
                modelo: { type: "string" }
              }
            },
            limit: { type: "number", description: "Límite de registros a retornar (default 100)" }
          }
        }
      },
      {
        name: "aggregate_ventas",
        description: "Agrupa y suma datos de ventas por dimensiones (canal, marca, modelo, sucursal). Retorna cantidad, ingreso, costo y margen.",
        parameters: {
          type: "object",
          properties: {
            groupBy: {
              type: "array",
              items: { type: "string" },
              description: "Dimensiones para agrupar, p.ej. ['canal', 'marca']"
            },
            filters: {
              type: "object",
              properties: {
                dia: { type: "string", description: "Día específico (YYYY-MM-DD)" },
                fecha_inicio: { type: "string", description: "Fecha desde (YYYY-MM-DD)" },
                fecha_fin: { type: "string", description: "Fecha hasta (YYYY-MM-DD)" },
                canal: { type: "string" },
                marca: { type: "string" }
              }
            }
          },
          required: ["groupBy"]
        }
      },
      {
        name: "get_top_productos",
        description: "Obtiene el ranking de mejores productos por un criterio (ingreso_neto, margen, cantidad).",
        parameters: {
          type: "object",
          properties: {
            orderBy: { type: "string", description: "Campo para ordenar: ingreso_neto, margen o cantidad" },
            limit: { type: "number" },
            filters: { type: "object" }
          },
          required: ["orderBy"]
        }
      },
      {
        name: "query_metas",
        description: "Consulta metas de ventas desde Google Sheets.",
        parameters: {
          type: "object",
          properties: {
            sheet_name: { type: "string", description: "Nombre de la hoja (Metas, Forecast, Comisiones, Catalogo)" },
            filters: { type: "object" }
          }
        }
      },
      {
        name: "list_sheets",
        description: "Lista todas las hojas disponibles en el archivo de Google Sheets.",
        parameters: { type: "object", properties: {} }
      }
    ]
  }
];

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: tools
});

// Configuración de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configuración de Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Configuración de Multer para upload de archivos
const upload = multer({ storage: multer.memoryStorage() });

// ============= FUNCIONES MCP ============= 

// Función para ejecutar herramientas MCP de Supabase
async function callSupabaseTool(toolName, args) {
  console.log(`[MCP Supabase] Calling tool: ${toolName}`, args);
  try {
    // Implementación directa sin spawn para MVP
    switch (toolName) {
      case 'query_ventas': {
        let query = supabase.from('ventas').select('*');

        if (args.filters) {
          Object.entries(args.filters).forEach(([key, value]) => {
            if (key === 'fecha_inicio' && value) {
              query = query.gte('dia', value);
            } else if (key === 'fecha_fin' && value) {
              query = query.lte('dia', value);
            } else if (key === 'dia' && value) {
              query = query.eq('dia', value);
            } else if (value) {
              query = query.eq(key, value);
            }
          });
        }

        query = query.limit(args.limit || 100);
        const { data, error } = await query;

        if (error) throw error;
        console.log(`[MCP Supabase] Tool ${toolName} success:`, { count: data.length });
        return { success: true, count: data.length, data };
      }

      case 'aggregate_ventas': {
        let query = supabase.from('ventas').select('*');

        if (args.filters) {
          Object.entries(args.filters).forEach(([key, value]) => {
            if (key === 'fecha_inicio' && value) {
              query = query.gte('dia', value);
            } else if (key === 'fecha_fin' && value) {
              query = query.lte('dia', value);
            } else if (key === 'dia' && value) {
              query = query.eq('dia', value);
            } else if (value) {
              query = query.eq(key, value);
            }
          });
        }

        const { data, error } = await query;
        if (error) throw error;

        // Agrupar en memoria
        const grouped = {};
        data.forEach(row => {
          const key = args.groupBy.map(field => row[field]).join('|');

          if (!grouped[key]) {
            grouped[key] = {
              group: {},
              cantidad: 0,
              ingreso_neto: 0,
              costo_neto: 0,
              margen: 0,
              count: 0
            };
            args.groupBy.forEach(field => {
              grouped[key].group[field] = row[field];
            });
          }

          grouped[key].cantidad += parseFloat(row.cantidad || 0);
          grouped[key].ingreso_neto += parseFloat(row.ingreso_neto || 0);
          grouped[key].costo_neto += parseFloat(row.costo_neto || 0);
          grouped[key].margen += parseFloat(row.margen || 0);
          grouped[key].count += 1;
        });

        return { success: true, count: Object.keys(grouped).length, data: Object.values(grouped) };
      }

      case 'get_top_productos': {
        let query = supabase.from('ventas').select('*');

        if (args.filters) {
          Object.entries(args.filters).forEach(([key, value]) => {
            if (key === 'fecha_inicio' && value) {
              query = query.gte('dia', value);
            } else if (key === 'fecha_fin' && value) {
              query = query.lte('dia', value);
            } else if (key === 'dia' && value) {
              query = query.eq('dia', value);
            } else if (value) {
              query = query.eq(key, value);
            }
          });
        }

        const { data, error } = await query;
        if (error) throw error;

        const sorted = data.sort((a, b) => {
          const valA = parseFloat(a[args.orderBy] || 0);
          const valB = parseFloat(b[args.orderBy] || 0);
          return valB - valA;
        });

        const top = sorted.slice(0, args.limit || 10);
        return { success: true, count: top.length, data: top };
      }
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Función para ejecutar herramientas MCP de Google Sheets
async function callSheetsTool(toolName, args) {
  console.log(`[MCP Sheets] Calling tool: ${toolName}`, args);
  try {
    const SHEET_ID = process.env.GOOGLE_SHEET_ID;

    async function readSheetData(sheetName, range = 'A:Z') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!${range}`,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return { headers: [], data: [] };
      }

      const headers = rows[0];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });

      return { headers, data };
    }

    switch (toolName) {
      case 'query_metas': {
        const sheetName = args.sheet_name || 'Metas';
        const { data } = await readSheetData(sheetName);

        let filtered = data;
        if (args.filters) {
          filtered = data.filter(row => {
            return Object.entries(args.filters).every(([key, value]) => {
              if (!value) return true;
              return row[key]?.toLowerCase().includes(value.toLowerCase());
            });
          });
        }

        return { success: true, sheet: sheetName, count: filtered.length, data: filtered };
      }

      case 'get_forecast':
      case 'get_comisiones':
      case 'get_catalogo': {
        const sheetMap = {
          'get_forecast': 'Forecast',
          'get_comisiones': 'Comisiones',
          'get_catalogo': 'Catalogo'
        };

        const sheetName = sheetMap[toolName];
        const { data } = await readSheetData(sheetName);
        console.log(`[MCP Sheets] Tool ${toolName} success:`, { count: data.length });
        return { success: true, sheet: sheetName, count: data.length, data };
      }

      case 'list_sheets': {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: SHEET_ID,
        });

        const sheetsList = response.data.sheets.map(sheet => ({
          name: sheet.properties.title,
          id: sheet.properties.sheetId
        }));

        return { success: true, spreadsheetId: SHEET_ID, sheets: sheetsList };
      }
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============= ENDPOINTS ============= 

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Alquimia Backend running' });
});

// Endpoint principal para chat con IA
app.post('/api/chat', async (req, res) => {
  console.log('[API] POST /api/chat - Request received');
  try {
    const { message, history = [] } = req.body;
    console.log(`[Chat] User message: "${message.substring(0, 50)}..."`);

    // Contexto del sistema con las herramientas MCP disponibles
    const systemPrompt = `Eres un asistente de análisis de datos para Alquimia Datalive. 
Tienes acceso a dos fuentes de datos a través de MCP (Model Context Protocol):

1. SUPABASE - Base de datos de ventas con:
   - Columnas: DIA, CANAL, SKU, Cantidad, ADQUISICIÓN, MARCA, MODELO, ORIGEN, SUCURSAL, Ingreso_Neto, Costo_Neto, Margen
   - Formato numérico chileno: punto (.) separador de miles, coma (,) separador de decimales
   
   Herramientas disponibles:
   - query_ventas: consulta datos con filtros
   - aggregate_ventas: agrega datos por dimensiones
   - get_top_productos: obtiene top productos por criterio

2. GOOGLE SHEETS - Datos de metas, forecast, comisiones y catálogo
   
   Herramientas disponibles:
   - query_metas: consulta metas mensuales
   - get_forecast: obtiene forecast de ventas
   - get_comisiones: tabla de comisiones
   - get_catalogo: catálogo de productos
   - list_sheets: lista hojas disponibles

Cuando el usuario haga una pregunta:
1. Determina qué herramienta(s) necesitas usar
2. Indica claramente qué herramienta usarás
3. Proporciona un análisis claro y en español

Formatea números con punto miles y coma decimales (formato chileno).`;

    // Construcción del historial de chat
    const chatHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

    chatHistory.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // Primera llamada a Gemini
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Estoy listo para ayudarte con análisis de datos usando las funciones disponibles.' }] },
        ...chatHistory
      ],
      tools: tools, // Incluir las herramientas aquí
    });

    let result = await chat.sendMessage(message);
    let response = result.response;

    // Bucle para manejar llamadas a funciones (herramientas)
    let callCount = 0;
    const MAX_CALLS = 5;
    let lastToolResults = [];

    while (response.candidates[0].content.parts.some(p => p.functionCall) && callCount < MAX_CALLS) {
      callCount++;
      const parts = response.candidates[0].content.parts;
      const toolResults = [];

      for (const part of parts) {
        if (part.functionCall) {
          const { name, args } = part.functionCall;
          console.log(`[Chat] Gemini wants to call tool: ${name}`, args);

          let toolResponse;
          if (name.startsWith('query_') || name.startsWith('aggregate_') || name.startsWith('get_top_')) {
            // Supabase tools
            if (name === 'query_metas') { // This is a Sheets tool, but its name starts with 'query_'
              toolResponse = await callSheetsTool(name, args);
            } else {
              toolResponse = await callSupabaseTool(name, args);
            }
          } else if (name === 'list_sheets' || name === 'get_forecast' || name === 'get_comisiones' || name === 'get_catalogo') {
            // Sheets tools
            toolResponse = await callSheetsTool(name, args);
          } else {
            // Fallback for any other tool name, assuming it's a Supabase tool
            console.warn(`[Chat] Unknown tool name encountered: ${name}. Attempting to call as Supabase tool.`);
            toolResponse = await callSupabaseTool(name, args);
          }

          toolResults.push({
            functionResponse: {
              name: name,
              response: toolResponse
            }
          });
          lastToolResults.push(name);
        }
      }

      console.log(`[Chat] Sending tool results back to Gemini (Turn ${callCount})`);
      result = await chat.sendMessage(toolResults);
      response = result.response;
    }

    const finalResponseText = response.text();
    console.log('[Chat] Gemini analysis complete, sending final response');

    res.json({
      success: true,
      response: finalResponseText,
      toolsUsed: lastToolResults,
      dataPreview: null
    });

  } catch (error) {
    console.error('[Chat] Error in /api/chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener todas las ventas
app.get('/api/ventas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .limit(100);

    if (error) throw error;

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener datos de Google Sheets
app.get('/api/sheets/:sheetName', async (req, res) => {
  try {
    const { sheetName } = req.params;
    const result = await callSheetsTool('query_metas', { sheet_name: sheetName });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload CSV
app.post('/api/upload-csv', upload.single('file'), async (req, res) => {
  console.log('[API] POST /api/upload-csv - Request received');
  try {
    if (!req.file) {
      console.warn('[Upload] No file provided');
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    console.log(`[Upload] File received: ${req.file.originalname}, size: ${req.file.size} bytes`);

    const results = [];
    const stream = Readable.from(req.file.buffer);

    stream
      .pipe(csvParser({
        separator: ';', // Ajustar según tu CSV
        mapHeaders: ({ header }) => header.trim()
      }))
      .on('data', (data) => {
        // Convertir formato chileno a float
        const parseChileanNumber = (str) => {
          if (!str) return 0;
          return parseFloat(str.replace(/\./g, '').replace(',', '.'));
        };

        const record = {
          dia: data.DIA,
          canal: data.CANAL,
          sku: data.SKU,
          cantidad: parseInt(data.Cantidad) || 0,
          adquisicion: data.ADQUISICIÓN,
          marca: data.MARCA,
          modelo: data.MODELO,
          origen: data.ORIGEN,
          sucursal: data.SUCURSAL,
          ingreso_neto: parseChileanNumber(data.Ingreso_Neto),
          costo_neto: parseChileanNumber(data.Costo_Neto),
          margen: parseChileanNumber(data.Margen)
        };

        results.push(record);
      })
      .on('end', async () => {
        try {
          console.log('[Upload] Starting Supabase insertion...');
          const { data, error } = await supabase
            .from('ventas')
            .insert(results);

          if (error) {
            console.error('[Upload] Supabase insert error:', error);
            throw error;
          }

          console.log('[Upload] Insertion successful');
          res.json({
            success: true,
            message: `${results.length} registros insertados correctamente`,
            count: results.length
          });
        } catch (error) {
          console.error('[Upload] Error during insertion process:', error);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
          }
        }
      })
      .on('error', (error) => {
        console.error('[Upload] CSV parsing error:', error);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Alquimia Backend running on port ${PORT}`);
  console.log(`📊 Supabase: ${process.env.SUPABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🤖 Gemini: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`📈 Google Sheets: ${process.env.GOOGLE_SHEET_ID ? 'Configured' : 'Not configured'}`);
});

export default app;
