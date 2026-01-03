import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
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
        name: "get_summary_stats",
        description: "OBTENER TOTALES RÁPIDOS (RECOMENDADO). Retorna el gran total de unidades, ingresos y margen para un periodo o filtro sin traer filas individuales. Ideal para ahorrar tokens.",
        parameters: {
          type: "object",
          properties: {
            filters: {
              type: "object",
              description: "Filtros opcionales (dia, canal, marca, sucursal, etc.)"
            }
          }
        }
      },
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
        name: "get_performance_report",
        description: "Compara el rendimiento de ventas de una fecha con el día anterior y el promedio de los últimos 3 días.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha de referencia (YYYY-MM-DD)" },
            filters: { type: "object", properties: { canal: { type: "string" }, marca: { type: "string" } } }
          },
          required: ["date"]
        }
      },
      {
        name: "check_gaps",
        description: "Identifica brechas de rendimiento comparando ventas reales con metas o forecast.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha o mes de referencia" },
            canal: { type: "string" }
          }
        }
      },
      {
        name: "query_metas",
        description: "Consulta metas de ventas desde la hoja 'Metas'.",
        parameters: {
          type: "object",
          properties: {
            filters: { type: "object" }
          }
        }
      },
      {
        name: "get_forecast",
        description: "Obtiene el forecast de ventas desde la hoja 'Forecast'.",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "get_comisiones",
        description: "Obtiene la tabla de comisiones desde la hoja 'Comisiones'.",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "get_catalogo",
        description: "Obtiene el catálogo de productos desde la hoja 'Catalogo'.",
        parameters: { type: "object", properties: {} }
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

// Configuración de Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
      case 'get_summary_stats': {
        let query = supabase.from('ventas').select('cantidad, ingreso_neto, costo_neto, margen');

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

        const summary = data.reduce((acc, row) => ({
          total_registros: acc.total_registros + 1,
          total_unidades: acc.total_unidades + parseFloat(row.cantidad || 0),
          total_ingreso: acc.total_ingreso + parseFloat(row.ingreso_neto || 0),
          total_costo: acc.total_costo + parseFloat(row.costo_neto || 0),
          total_margen: acc.total_margen + parseFloat(row.margen || 0)
        }), { total_registros: 0, total_unidades: 0, total_ingreso: 0, total_costo: 0, total_margen: 0 });

        return {
          success: true,
          message: "Totales calculados sobre el 100% de los datos filtrados.",
          data: summary
        };
      }

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

        query = query.limit(args.limit || 100); // Reducido de 1000 a 100 para evitar saturar el contexto de la IA
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

      case 'get_performance_report': {
        const refDate = new Date(args.date);
        const yesterday = new Date(refDate);
        yesterday.setDate(yesterday.getDate() - 1);

        const threeDaysAgo = new Date(refDate);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const formatDate = (d) => d.toISOString().split('T')[0];

        // 1. Ventas día referencia
        const { data: refData } = await callSupabaseTool('aggregate_ventas', {
          groupBy: ['canal'],
          filters: { ...args.filters, dia: args.date }
        });

        // 2. Ventas ayer
        const { data: yestData } = await callSupabaseTool('aggregate_ventas', {
          groupBy: ['canal'],
          filters: { ...args.filters, dia: formatDate(yesterday) }
        });

        // 3. Ventas últimos 3 días (promedio)
        const { data: last3Data } = await callSupabaseTool('aggregate_ventas', {
          groupBy: ['canal'],
          filters: {
            ...args.filters,
            fecha_inicio: formatDate(threeDaysAgo),
            fecha_fin: formatDate(yesterday)
          }
        });

        return {
          success: true,
          reference_date: args.date,
          data: {
            today: refData,
            yesterday: yestData,
            avg_last_3_days: last3Data.map(d => ({ ...d, cantidad: d.cantidad / 3, ingreso_neto: d.ingreso_neto / 3 }))
          }
        };
      }

      case 'check_gaps': {
        // Esta herramienta combina ventas con metas
        const sales = await callSupabaseTool('aggregate_ventas', { groupBy: ['canal'], filters: args.filters });
        const metas = await callSheetsTool('query_metas', { filters: args.filters });

        return {
          success: true,
          sales: sales.data,
          metas: metas.data,
          analysis: "Compara las ventas vs las metas para identificar donde el canal está caído."
        };
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

// Helper para truncar resultados de herramientas y evitar RateLimit / Token Bloat
function truncateToolResult(result, maxRecords = 20) {
  if (result.success && Array.isArray(result.data) && result.data.length > maxRecords) {
    const totalCount = result.data.length;
    return {
      ...result,
      data: result.data.slice(0, maxRecords),
      truncated: true,
      originalCount: totalCount,
      message: `Mostrando solo los primeros ${maxRecords} registros de ${totalCount}. Por favor, pide filtros más específicos o usa agregación para ver el total.`
    };
  }
  return result;
}

// Endpoint principal para chat con IA
app.post('/api/chat', async (req, res) => {
  console.log('[API] POST /api/chat - Request received');
  try {
    const { message, history = [], modelConfig = { provider: 'gemini', modelId: 'gemini-2.5-flash' } } = req.body;
    console.log(`[Chat] User message: "${message.substring(0, 50)}..." using ${modelConfig.provider} (${modelConfig.modelId})`);

    const today = new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
    const systemPrompt = `Eres un ANALISTA DE DATOS SENIOR actuando como asistente para el JEFE DE CANAL de Alquimia Datalive.
Tu objetivo es ayudar al Jefe de Canal a tomar decisiones estratégicas basadas en datos reales.

FECHA ACTUAL (Chile): ${today}

FORMATO DE RESPUESTA (CRÍTICO para WhatsApp/Escritorio):
1. ESTRUCTURA: Usa títulos en negrita (ej: *RESUMEN DE VENTAS*) para separar secciones.
2. LISTAS: Usa viñetas claras (• o -) para métricas individuales. No escribas párrafos largos.
3. NEGRILLAS: Usa asteriscos para resaltar cifras y nombres de canales/marcas (ej: *81 unidades*).
4. ESPACIADO: Deja un doble salto de línea entre cada bloque principal de información.
5. EFICIENCIA (MÁXIMA PRIORIDAD): Para responder preguntas de totales, promedios o "cómo voy", utiliza SIEMPRE la herramienta `get_summary_stats`. Esta herramienta es la más barata en tokens y procesa el 100% de la base de datos.
6. SEGMENTACIÓN: Si el usuario pide totales por canal o marca, usa `aggregate_ventas`.
7. DETALLE: Usa `query_ventas` (filas individuales) ÚNICAMENTE si el usuario pide ver de forma explícita los registros detallados de una venta.
8. AVISO: Explícale al usuario que usas herramientas de resumen para asegurar precisión sobre el 100% de la data sin gastar tokens innecesarios.
9. VISUAL: Menciona el DASHBOARD VISUAL en la parte superior.
10. EJECUTIVO: Ve al grano. Menos texto, más estructura.

DIRECTRICES DE ANÁLISIS:
1. PERSONA: Responde de forma ejecutiva, proactiva y orientada a resultados. No solo des números, da INSIGHTS.
2. COMPARATIVAS: Cuando pregunten "cómo voy", compara SIEMPRE contra:
   - El día anterior o promedio de los últimos días si es posible.
   - Las metas o el forecast (usa las herramientas de Sheets).
3. IDENTIFICACIÓN DE GAPS: Indica claramente dónde el canal/modelo está "caído" (bajo objetivo o tendencia) y dónde está "mejor" (sobre objetivo).
4. MULTI-PASO: No dudes en llamar a varias herramientas en secuencia para dar una respuesta completa.
5. LIMITACIÓN DE DATOS: Solo pide filas individuales si es estrictamente necesario para un análisis de detalle. Prefiere 'aggregate_ventas' para totales.

DATOS DISPONIBLES:
1. SUPABASE (Ventas): DIA, CANAL, SKU, Cantidad, Ingreso, Costo, Margen.
2. GOOGLE SHEETS: Metas, Forecast, Comisiones, Catalogo.

Cuando uses formatos numéricos: Punto para miles, coma para decimales (ej: $1.234,50).`;

    if (modelConfig.provider === 'claude') {
      // --- LÓGICA CLAUDE ---
      const claudeTools = tools[0].functionDeclarations.map(fd => ({
        name: fd.name,
        description: fd.description,
        input_schema: fd.parameters
      }));

      let messages = history.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));
      messages.push({ role: 'user', content: message });

      let response = await anthropic.messages.create({
        model: modelConfig.modelId,
        max_tokens: 4096,
        system: systemPrompt,
        tools: claudeTools,
        messages: messages,
      });

      let callCount = 0;
      const MAX_CALLS = 5;
      let toolsUsed = [];

      while (response.stop_reason === 'tool_use' && callCount < MAX_CALLS) {
        callCount++;
        messages.push({ role: 'assistant', content: response.content });

        const toolResults = [];
        for (const contentBlock of response.content) {
          if (contentBlock.type === 'tool_use') {
            const { name, input, id } = contentBlock;
            console.log(`[Chat] Claude wants to call tool: ${name}`, input);
            toolsUsed.push(name);

            let toolResult;
            if (name.startsWith('query_') || name.startsWith('aggregate_') || name.startsWith('get_top_')) {
              if (name === 'query_metas') {
                toolResult = await callSheetsTool(name, input);
              } else {
                toolResult = await callSupabaseTool(name, input);
              }
            } else if (['list_sheets', 'get_forecast', 'get_comisiones', 'get_catalogo'].includes(name)) {
              toolResult = await callSheetsTool(name, input);
            } else {
              toolResult = await callSupabaseTool(name, input);
            }

            // Aplicar truncado antes de enviar a Claude
            const processedResult = truncateToolResult(toolResult);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: id,
              content: JSON.stringify(processedResult)
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });

        response = await anthropic.messages.create({
          model: modelConfig.modelId,
          max_tokens: 4096,
          system: systemPrompt,
          tools: claudeTools,
          messages: messages,
        });
      }

      const finalContent = response.content.find(c => c.type === 'text')?.text || "";
      return res.json({
        success: true,
        response: finalContent,
        toolsUsed: toolsUsed,
        dataPreview: null
      });

    } else {
      // --- LÓGICA GEMINI (Default) ---
      const model = genAI.getGenerativeModel({
        model: modelConfig.modelId || 'gemini-2.5-flash',
        tools: tools
      });

      const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Entendido. Estoy listo para ayudarte.' }] },
          ...chatHistory
        ],
        tools: tools,
      });

      let result = await chat.sendMessage(message);
      let response = result.response;

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
              if (name === 'query_metas') {
                toolResponse = await callSheetsTool(name, args);
              } else {
                toolResponse = await callSupabaseTool(name, args);
              }
            } else if (['list_sheets', 'get_forecast', 'get_comisiones', 'get_catalogo'].includes(name)) {
              toolResponse = await callSheetsTool(name, args);
            } else {
              toolResponse = await callSupabaseTool(name, args);
            }

            // Aplicar truncado antes de enviar a Gemini
            const processedResponse = truncateToolResult(toolResponse);

            toolResults.push({
              functionResponse: {
                name: name,
                response: processedResponse
              }
            });
            lastToolResults.push(name);
          }
        }

        result = await chat.sendMessage(toolResults);
        response = result.response;
      }

      return res.json({
        success: true,
        response: response.text(),
        toolsUsed: lastToolResults,
        dataPreview: null
      });
    }

  } catch (error) {
    console.error('[Chat] Error in /api/chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener ventas con paginación
app.get('/api/ventas', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    console.log(`[API] GET /api/ventas - Page: ${page}, Limit: ${limit}`);

    const { data, error, count } = await supabase
      .from('ventas')
      .select('*', { count: 'exact' })
      .order('dia', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para KPIs consolidados (Servidor)
app.get('/api/analytics/kpis', async (req, res) => {
  try {
    console.log('[API] GET /api/analytics/kpis');
    // Usamos la lógica de get_summary_stats
    const result = await callSupabaseTool('get_summary_stats', {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para Datos de Gráficos (Servidor)
app.get('/api/analytics/charts', async (req, res) => {
  try {
    console.log('[API] GET /api/analytics/charts');

    // Obtenemos todos los datos necesarios para agrupar (solo campos clave para ahorrar ancho de banda internos)
    const { data, error } = await supabase
      .from('ventas')
      .select('dia, canal, marca, cantidad');

    if (error) throw error;

    // 1. Tendencia Temporal
    const trend = {};
    // 2. Por Canal
    const byChannel = {};
    // 3. Por Marca
    const byBrand = {};

    data.forEach(row => {
      // Trend
      trend[row.dia] = (trend[row.dia] || 0) + (row.cantidad || 0);
      // Channel
      byChannel[row.canal] = (byChannel[row.canal] || 0) + (row.cantidad || 0);
      // Brand
      byBrand[row.marca] = (byBrand[row.marca] || 0) + (row.cantidad || 0);
    });

    const charts = {
      trend: Object.keys(trend).sort().map(d => ({ date: d, value: trend[d] })),
      channels: Object.keys(byChannel).map(name => ({ name, value: byChannel[name] })),
      brands: Object.keys(byBrand).map(name => ({ name, value: byBrand[name] }))
    };

    res.json({ success: true, data: charts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener el conteo total de registros
app.get('/api/ventas-count', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('ventas')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    res.json({ success: true, total: count });
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
          const totalRecords = results.length;
          console.log(`[Upload] CSV parsing complete. Total records to insert: ${totalRecords}`);

          if (totalRecords === 0) {
            return res.json({ success: true, message: 'No se encontraron registros en el archivo', count: 0 });
          }

          const BATCH_SIZE = 2000;
          const CONCURRENCY = 3;
          let insertedCount = 0;

          console.log(`[Upload] Starting parallel batch insertion (${BATCH_SIZE} records per batch, ${CONCURRENCY} at a time)...`);

          const batches = [];
          for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
            batches.push(results.slice(i, i + BATCH_SIZE));
          }

          // Procesar lotes en grupos paralelos para ganar velocidad sin saturar
          for (let i = 0; i < batches.length; i += CONCURRENCY) {
            const currentGroup = batches.slice(i, i + CONCURRENCY);
            const groupNum = Math.floor(i / CONCURRENCY) + 1;
            const totalGroups = Math.ceil(batches.length / CONCURRENCY);

            console.log(`[Upload] Processing group ${groupNum}/${totalGroups} (${currentGroup.length} batches)...`);

            const insertPromises = currentGroup.map((batch, index) => {
              const batchTotalIndex = i + index + 1;
              console.log(`[Upload] - Starting batch ${batchTotalIndex}/${batches.length} (${batch.length} records)`);
              return supabase.from('ventas').insert(batch);
            });

            const results_group = await Promise.all(insertPromises);

            // Verificar errores en el grupo
            results_group.forEach((resp, index) => {
              if (resp.error) {
                console.error(`[Upload] Error in batch ${i + index + 1}:`, resp.error);
                throw new Error(`Error en el lote ${i + index + 1}: ${resp.error.message}`);
              }
              insertedCount += currentGroup[index].length;
            });
          }

          console.log('[Upload] All parallel batches inserted successfully');
          res.json({
            success: true,
            message: `${insertedCount} registros insertados correctamente en ${batches.length} lotes paralelos`,
            count: insertedCount
          });
        } catch (error) {
          console.error('[Upload] Error during insertion process:', error);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: error.message,
              details: "Error durante la inserción masiva en Supabase. Verifica el formato de los datos."
            });
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
