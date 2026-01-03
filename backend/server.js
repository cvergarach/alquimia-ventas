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

// Función para obtener herramientas dinámicamente de Supabase
async function getDynamicTools() {
  try {
    const { data, error } = await supabase
      .from('ai_tools')
      .select('*')
      .eq('enabled', true);

    if (error || !data || data.length === 0) {
      console.warn('[Tools] No dynamic tools found or error, using fallback hardcoded tools.', error?.message);
      return hardcodedTools;
    }

    console.log(`[Tools] Loaded ${data.length} dynamic tools from Supabase.`);
    return [{
      functionDeclarations: data.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }];
  } catch (err) {
    console.error('[Tools] Error fetching dynamic tools:', err);
    return hardcodedTools;
  }
}

// Configuración de herramientas estáticas (Fallback)
const hardcodedTools = [
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
        description: "VISTA DE DETALLE (NO USAR PARA TOTALES). Consulta transacciones individuales. Retorna máximo 100 filas. Úsalo solo si el usuario pide ver 'ejemplos' o 'detalle' de transacciones.",
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
        description: "PROCESAR TOTALES POR SEGMENTO. Úsalo SIEMPRE para saber cuánto se vendió por canal, marca, modelo, etc. Esta herramienta es precisa y ahorra miles de tokens.",
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

// Helper para obtener TODOS los datos paginando (bypass límite de 1000 de Supabase)
async function fetchFullData(query, maxRecords = 60000) {
  let allData = [];
  let from = 0;
  const step = 1000;
  let done = false;

  while (!done && allData.length < maxRecords) {
    const { data, error } = await query.range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) {
      done = true;
    } else {
      allData = allData.concat(data);
      console.log(`[FullData] Fetched chunk: ${from}-${from + data.length - 1} | Total so far: ${allData.length}`);
      if (data.length < step) {
        done = true;
      } else {
        from += step;
      }
    }
  }
  console.log(`[FullData] Finished fetching. Total records: ${allData.length}`);
  return allData;
}

// Función para ejecutar herramientas MCP de Supabase
async function callSupabaseTool(toolName, args) {
  console.log(`[MCP Supabase] Calling tool: ${toolName}`, args);
  try {
    // Implementación directa sin spawn para MVP
    switch (toolName) {
      case 'get_summary_stats': {
        // Seleccionamos solo las columnas necesarias para no saturar memoria
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

        const data = await fetchFullData(query, 60000);

        const summary = data.reduce((acc, row) => ({
          total_registros: acc.total_registros + 1,
          total_unidades: acc.total_unidades + parseFloat(row.cantidad || 0),
          total_ingreso: acc.total_ingreso + parseFloat(row.ingreso_neto || 0),
          total_costo: acc.total_costo + parseFloat(row.costo_neto || 0),
          total_margen: acc.total_margen + parseFloat(row.margen || 0)
        }), { total_registros: 0, total_unidades: 0, total_ingreso: 0, total_costo: 0, total_margen: 0 });

        return {
          success: true,
          message: "Totales procesados en servidor sobre el 100% de la data filtrada.",
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

        const safeLimit = Math.min(args.limit || 100, 100);
        query = query.limit(safeLimit);
        const { data, error } = await query;

        if (error) throw error;
        console.log(`[MCP Supabase] Tool ${toolName} success:`, { count: data.length });
        return { success: true, count: data.length, data };
      }

      case 'aggregate_ventas': {
        // Seleccionamos solo las columnas necesarias para agrupar y sumar
        let query = supabase.from('ventas').select('cantidad, ingreso_neto, costo_neto, margen, canal, marca, modelo, sucursal, dia');

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

        const data = await fetchFullData(query, 60000);

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
        // Seleccionamos solo columnas clave para el ranking
        let query = supabase.from('ventas').select('sku, modelo, marca, cantidad, ingreso_neto, margen');

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

        const data = await fetchFullData(query, 60000);

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

      default: {
        // Herramientas dinámicas (creadas por el usuario)
        const { data: tool, error: toolErr } = await supabase
          .from('ai_tools')
          .select('sql_template')
          .eq('name', toolName)
          .single();

        if (toolErr || !tool?.sql_template) return { success: false, error: `Herramienta ${toolName} no encontrada.` };

        // Reemplazar placeholders en el SQL template
        let sql = tool.sql_template;

        // Unimos args de primer nivel y filtros para que la IA tenga flexibilidad
        const allArgs = { ...args, ...(args.filters || {}) };
        delete allArgs.filters;

        // Reemplazo inteligente de {{field}}
        Object.entries(allArgs).forEach(([key, value]) => {
          if (value === undefined || value === null) return;

          // Escapar comillas simples para evitar inyección básica
          const escapedValue = typeof value === 'string' ? value.replace(/'/g, "''") : value;

          // Caso 1: El placeholder está dentro de comillas '{{campo}}' o "{{campo}}"
          // Reemplazamos quitando nuestras propias comillas del formateo
          sql = sql.replace(new RegExp(`['"]{{${key}}}['"]`, 'g'), `'${escapedValue}'`);

          // Caso 2: El placeholder está solo {{campo}}
          // Formateamos según el tipo
          const formattedValue = typeof value === 'number' ? value : `'${escapedValue}'`;
          sql = sql.replace(new RegExp(`{{${key}}}`, 'g'), formattedValue);
        });

        // Limpiar placeholders no usados (poner NULL para que la consulta no falle)
        sql = sql.replace(/{{[a-zA-Z0-9_]+}}/g, 'NULL');

        console.log(`[Dynamic Tool] Executing SQL: ${sql}`);

        const { data: result, error: execErr } = await supabase.rpc('execute_ai_query', { sql_query: sql });

        if (execErr) {
          console.error('[Dynamic Tool] RPC Error:', execErr);
          throw execErr;
        }

        // Si la función de Supabase devolvió un objeto de error (capturado por el EXCEPTION block)
        if (result && !Array.isArray(result) && result.error) {
          console.error('[Dynamic Tool] SQL Logic Error:', result.error);
          return { success: false, error: `Error en la consulta SQL: ${result.error}` };
        }

        return { success: true, data: result };
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

    // Obtener herramientas dinámicas
    const currentTools = await getDynamicTools();

    const today = new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
    const systemPrompt = `Eres un ANALISTA DE DATOS SENIOR actuando como asistente para el JEFE DE CANAL de Alquimia Datalive.
Tu objetivo es ayudar al Jefe de Canal a tomar decisiones estratégicas basadas en datos reales.

FECHA ACTUAL (Chile): ${today}

FORMATO DE RESPUESTA (CRÍTICO para WhatsApp/Escritorio):
1. ESTRUCTURA: Usa títulos en negrita (ej: *RESUMEN DE VENTAS*) para separar secciones.
2. LISTAS: Usa viñetas claras (• o -) para métricas individuales. No escribas párrafos largos.
3. NEGRILLAS: Usa asteriscos para resaltar cifras y nombres de canales/marcas (ej: *81 unidades*).
4. ESPACIADO: Deja un doble salto de línea entre cada bloque principal de información.
5. EJECUTIVO: Ve al grano. Menos texto, más estructura.

SELECCIÓN DE HERRAMIENTAS (CRÍTICO):
1. **get_summary_stats**: Para totales generales, promedios, o "cómo voy". La más eficiente.
2. **aggregate_ventas**: Para totales agrupados por canal, marca, sucursal, o modelo.
3. **query_ventas**: Para consultas de PRODUCTOS ESPECÍFICOS o cuando necesites:
   - Ver productos individuales (ej: "productos menos vendidos", "top 10 SKUs", "qué modelos se vendieron")
   - Ordenar por cantidad, ingreso, margen, o costo
   - Filtrar por fecha específica + canal/marca/sucursal
   - Cualquier consulta que requiera ver filas de productos individuales

IMPORTANTE: Si el usuario pregunta por "productos", "modelos", "SKUs", o pide ver "cuáles" o "qué" se vendió/no se vendió, USA query_ventas.

DIRECTRICES DE ANÁLISIS:
1. PERSONA: Responde de forma ejecutiva, proactiva y orientada a resultados. No solo des números, da INSIGHTS.
2. COMPARATIVAS: Cuando pregunten "cómo voy", compara SIEMPRE contra el día anterior o promedio de los últimos días si es posible.
3. IDENTIFICACIÓN DE GAPS: Indica claramente dónde el canal/modelo está "caído" (bajo objetivo o tendencia) y dónde está "mejor" (sobre objetivo).
4. MULTI-PASO: No dudes en llamar a varias herramientas en secuencia para dar una respuesta completa.
5. NUNCA INVENTES HERRAMIENTAS: Solo usa las herramientas que están disponibles. Si no puedes responder con las herramientas actuales, explica qué necesitarías.

DATOS DISPONIBLES:
1. SUPABASE (Ventas): DIA, CANAL, SKU, MODELO, MARCA, Cantidad, Ingreso, Costo, Margen, Sucursal.
2. GOOGLE SHEETS: Metas, Forecast, Comisiones, Catalogo.

Cuando uses formatos numéricos: Punto para miles, coma para decimales (ej: $1.234,50).`;

    if (modelConfig.provider === 'claude') {
      // --- LÓGICA CLAUDE ---
      const claudeTools = currentTools[0].functionDeclarations.map(fd => ({
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
        model: modelConfig.modelId || 'gemini-1.5-flash',
        tools: currentTools
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
        tools: currentTools,
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
    const filters = req.query;
    console.log('[API] GET /api/analytics/kpis', filters);
    // Usamos la lógica de get_summary_stats con los filtros pasados
    const result = await callSupabaseTool('get_summary_stats', { filters });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para Datos de Gráficos (Servidor)
app.get('/api/analytics/charts', async (req, res) => {
  try {
    const filters = req.query;
    console.log('[API] GET /api/analytics/charts', filters);

    // Obtenemos todos los datos necesarios para agrupar aplicando filtros
    let query = supabase.from('ventas').select('dia, canal, marca, cantidad');

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (!value) return;
        if (key === 'fecha_inicio') query = query.gte('dia', value);
        else if (key === 'fecha_fin') query = query.lte('dia', value);
        else if (key === 'dia') query = query.eq('dia', value);
        else query = query.eq(key, value);
      });
    }

    const data = await fetchFullData(query, 60000);

    const trend = {};
    const byChannel = {};
    const byBrand = {};

    data.forEach(row => {
      trend[row.dia] = (trend[row.dia] || 0) + (row.cantidad || 0);
      byChannel[row.canal] = (byChannel[row.canal] || 0) + (row.cantidad || 0);
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

// Endpoint para obtener valores únicos de filtros
app.get('/api/analytics/filters', async (req, res) => {
  try {
    console.log('[API] GET /api/analytics/filters');

    // Función helper para obtener valores únicos usando fetchFullData
    const getDistinct = async (column) => {
      const query = supabase.from('ventas').select(column).order('id');
      const data = await fetchFullData(query, 60000);
      const uniqueValues = [...new Set(data.map(item => item[column]))].filter(Boolean).sort();
      console.log(`[Filters] ${column}: ${uniqueValues.length} unique values from ${data.length} total records`);
      return uniqueValues;
    };

    const [canales, marcas, sucursales] = await Promise.all([
      getDistinct('canal'),
      getDistinct('marca'),
      getDistinct('sucursal')
    ]);

    console.log(`[API] Filters retrieved - Canales: ${canales.length}, Marcas: ${marcas.length}, Sucursales: ${sucursales.length}`);

    res.json({
      success: true,
      data: { canales, marcas, sucursales }
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
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
        separator: ';',
        mapHeaders: ({ header }) => {
          // Normalización robusta: trim, minúsculas, SIN ACENTOS, y quitar caracteres especial al final (como _)
          const h = header.trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
            .replace(/[^a-z0-9_]+/g, '_') // Reemplazar no alfanuméricos por _
            .replace(/^_|_$/g, ''); // Quitar _ al inicio o final
          return h;
        }
      }))
      .on('data', (data) => {
        const parseChileanNumber = (str) => {
          if (!str || typeof str !== 'string') return typeof str === 'number' ? str : 0;
          // Limpiar: quitar símbolos de moneda, espacios, y puntos de miles
          const clean = str.replace(/[$\s.]/g, '').replace(',', '.');
          const num = parseFloat(clean);
          return isNaN(num) ? 0 : num;
        };

        // Mapeo flexible para nombres de columnas
        const record = {
          dia: data.dia || data.fecha || data.date,
          canal: data.canal || data.channel,
          sku: data.sku,
          cantidad: parseInt(data.cantidad || data.unidades || data.units) || 0,
          adquisicion: data.adquisicion || data.tipo,
          marca: data.marca || data.brand,
          modelo: data.modelo || data.model,
          origen: data.origen,
          sucursal: data.sucursal || data.store,
          ingreso_neto: parseChileanNumber(data.ingreso_neto || data.ingresos || data.revenue || data.total),
          costo_neto: parseChileanNumber(data.costo_neto || data.costo || data.costs),
          margen: parseChileanNumber(data.margen || data.margin || data.profit)
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

// ============= ENDPOINTS DE CONFIGURACION =============

// Listar herramientas
app.get('/api/settings/tools', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_tools')
      .select('*')
      .order('name');
    if (error) {
      console.error('[Settings] Error fetching tools:', error);
      return res.status(500).json({ success: false, error: error.message, details: error });
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Settings] Catch error fetching tools:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear/Actualizar herramienta
app.post('/api/settings/tools', async (req, res) => {
  try {
    const tool = req.body;
    console.log('[Settings] Upserting tool:', tool.name);

    const { data, error } = await supabase
      .from('ai_tools')
      .upsert(tool)
      .select();

    if (error) {
      console.error('[Settings] Error saving tool:', error);
      return res.status(500).json({ success: false, error: error.message, details: error });
    }
    res.json({ success: true, data: data[0] });
  } catch (error) {
    console.error('[Settings] Catch error saving tool:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar herramienta
app.delete('/api/settings/tools/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('ai_tools')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[Settings] Error deleting tool:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, message: 'Herramienta eliminada' });
  } catch (error) {
    console.error('[Settings] Catch error deleting tool:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generar una herramienta usando IA
app.post('/api/settings/generate-tool', async (req, res) => {
  try {
    const { prompt, modelId = 'gemini-1.5-pro' } = req.body;
    console.log(`[AI Tool Gen] Petición recibida: ${prompt} usando ${modelId}`);

    const isClaude = modelId.startsWith('claude');
    let data;

    const aiPrompt = `Eres un experto en ingeniería de AI Tools y SQL de Postgres. 
El usuario quiere crear una nueva capacidad (tool) para un asistente que analiza ventas.
Base de datos: Tabla 'ventas' con columnas: [id, dia, canal, sku, cantidad, adquisicion, marca, modelo, origen, sucursal, ingreso_neto, costo_neto, margen].

REQUERIMIENTO DEL USUARIO: "${prompt}"

Tu tarea es devolver un objeto JSON con la definición técnica completa. 
Para el SQL, usa SIEMPRE este patrón de filtros flexibles: WHERE ({{campo}} IS NULL OR campo = {{campo}}).

Formato de respuesta (DEBE SER JSON PURO):
{
  "name": "nombre_en_snake_case",
  "description": "Explicación clara de qué hace esta función y cuándo usarla",
  "parameters": {
    "type": "object",
    "properties": {
      "filters": {
        "type": "object",
        "description": "Filtros opcionales (dia, canal, marca, sucursal, fecha_inicio, fecha_fin)"
      }
    }
  },
  "sql_template": "SELECT ... FROM ventas WHERE ({{canal}} IS NULL OR canal = {{canal}}) AND ... GROUP BY ... ORDER BY ... LIMIT 50",
  "provider": "supabase"
}`;

    if (isClaude) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada.');

      const response = await anthropic.messages.create({
        model: modelId,
        max_tokens: 2000,
        messages: [{ role: 'user', content: aiPrompt + "\nResponde únicamente con el JSON." }],
      });

      const text = response.content[0].text;
      // Extraer JSON si hay texto adicional
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    } else {
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada.');

      const cleanModelId = modelId === 'gemini-1.5-flash' ? 'gemini-1.5-flash-latest' : modelId;
      const generationModel = genAI.getGenerativeModel({
        model: cleanModelId,
        generationConfig: { responseMimeType: "application/json" }
      });

      const result = await generationModel.generateContent(aiPrompt);
      data = JSON.parse(result.response.text());
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('[AI Tool Gen] Error:', error);
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

// ============= ENDPOINTS DE AUTENTICACION Y USUARIOS =============

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('username', username)
      .eq('password', password) // En producción usar hashing
      .single();

    if (error || !data) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    res.json({
      success: true, data: {
        id: data.id,
        username: data.username,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listar usuarios
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, email, first_name, last_name, phone, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear usuario
app.post('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .insert([req.body])
      .select();

    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar usuario
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default app;
