import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';

// Configurar autenticación de Google
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const server = new Server(
  {
    name: 'google-sheets-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Listar herramientas disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_metas',
        description: 'Consulta metas mensuales por marca y sucursal desde Google Sheets',
        inputSchema: {
          type: 'object',
          properties: {
            sheet_name: {
              type: 'string',
              description: 'Nombre de la hoja (ej: Metas, Forecast, Comisiones, Catalogo)',
              default: 'Metas'
            },
            filters: {
              type: 'object',
              description: 'Filtros opcionales (marca, sucursal, mes, etc.)'
            }
          }
        }
      },
      {
        name: 'get_forecast',
        description: 'Obtiene el forecast de ventas desde Google Sheets',
        inputSchema: {
          type: 'object',
          properties: {
            periodo: {
              type: 'string',
              description: 'Periodo del forecast (ej: 2024-12, 2025-01)'
            }
          }
        }
      },
      {
        name: 'get_comisiones',
        description: 'Obtiene tabla de comisiones por modelo desde Google Sheets',
        inputSchema: {
          type: 'object',
          properties: {
            marca: {
              type: 'string',
              description: 'Marca para filtrar comisiones'
            }
          }
        }
      },
      {
        name: 'get_catalogo',
        description: 'Obtiene catálogo de productos con SKU, precios y stock desde Google Sheets',
        inputSchema: {
          type: 'object',
          properties: {
            sku: {
              type: 'string',
              description: 'SKU específico a consultar'
            }
          }
        }
      },
      {
        name: 'list_sheets',
        description: 'Lista todas las hojas disponibles en el Google Sheet',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Función auxiliar para leer datos del sheet
async function readSheetData(sheetName, range = 'A:Z') {
  try {
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
  } catch (error) {
    throw new Error(`Error leyendo hoja ${sheetName}: ${error.message}`);
  }
}

// Función auxiliar para filtrar datos
function filterData(data, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return data;
  }

  return data.filter(row => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return row[key]?.toLowerCase().includes(value.toLowerCase());
    });
  });
}

// Manejar llamadas a herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_metas': {
        const sheetName = args.sheet_name || 'Metas';
        const { data } = await readSheetData(sheetName);
        const filtered = filterData(data, args.filters);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sheet: sheetName,
                count: filtered.length,
                data: filtered
              }, null, 2)
            }
          ]
        };
      }

      case 'get_forecast': {
        const { data } = await readSheetData('Forecast');
        let filtered = data;

        if (args.periodo) {
          filtered = data.filter(row => row.Periodo === args.periodo);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                periodo: args.periodo || 'todos',
                count: filtered.length,
                data: filtered
              }, null, 2)
            }
          ]
        };
      }

      case 'get_comisiones': {
        const { data } = await readSheetData('Comisiones');
        let filtered = data;

        if (args.marca) {
          filtered = data.filter(row => 
            row.Marca?.toLowerCase().includes(args.marca.toLowerCase())
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                marca: args.marca || 'todas',
                count: filtered.length,
                data: filtered
              }, null, 2)
            }
          ]
        };
      }

      case 'get_catalogo': {
        const { data } = await readSheetData('Catalogo');
        let filtered = data;

        if (args.sku) {
          filtered = data.filter(row => row.SKU === args.sku);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sku: args.sku || 'todos',
                count: filtered.length,
                data: filtered
              }, null, 2)
            }
          ]
        };
      }

      case 'list_sheets': {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: SHEET_ID,
        });

        const sheetsList = response.data.sheets.map(sheet => ({
          name: sheet.properties.title,
          id: sheet.properties.sheetId,
          rowCount: sheet.properties.gridProperties.rowCount,
          columnCount: sheet.properties.gridProperties.columnCount
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                spreadsheetId: SHEET_ID,
                sheets: sheetsList
              }, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Herramienta desconocida: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Iniciar servidor
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Google Sheets Server running');
}

main().catch(console.error);
