import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const server = new Server(
  {
    name: 'supabase-ventas-server',
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
        name: 'query_ventas',
        description: 'Consulta datos de ventas en Supabase. Puede filtrar por fecha, canal, marca, modelo, sucursal, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            filters: {
              type: 'object',
              description: 'Filtros opcionales para la consulta',
              properties: {
                dia: { type: 'string', description: 'Fecha específica' },
                canal: { type: 'string', description: 'Canal de venta (ej: E-COMMERCE, CAC)' },
                marca: { type: 'string', description: 'Marca del producto' },
                modelo: { type: 'string', description: 'Modelo del producto' },
                sucursal: { type: 'string', description: 'Sucursal' },
                fecha_inicio: { type: 'string', description: 'Fecha inicio para rango' },
                fecha_fin: { type: 'string', description: 'Fecha fin para rango' }
              }
            },
            limit: {
              type: 'number',
              description: 'Límite de resultados (default: 100)',
              default: 100
            }
          }
        }
      },
      {
        name: 'aggregate_ventas',
        description: 'Agrega datos de ventas por diferentes dimensiones (suma, promedio, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            groupBy: {
              type: 'array',
              description: 'Campos por los que agrupar (marca, canal, sucursal, etc.)',
              items: { type: 'string' }
            },
            metrics: {
              type: 'array',
              description: 'Métricas a calcular (sum, avg, count)',
              items: { type: 'string' }
            },
            filters: {
              type: 'object',
              description: 'Filtros opcionales'
            }
          },
          required: ['groupBy', 'metrics']
        }
      },
      {
        name: 'get_top_productos',
        description: 'Obtiene los productos más vendidos o con mejor margen',
        inputSchema: {
          type: 'object',
          properties: {
            orderBy: {
              type: 'string',
              enum: ['cantidad', 'ingreso_neto', 'margen'],
              description: 'Campo por el que ordenar'
            },
            limit: {
              type: 'number',
              description: 'Cantidad de resultados',
              default: 10
            },
            filters: {
              type: 'object',
              description: 'Filtros opcionales'
            }
          },
          required: ['orderBy']
        }
      },
      {
        name: 'insert_ventas',
        description: 'Inserta nuevos registros de ventas desde CSV',
        inputSchema: {
          type: 'object',
          properties: {
            records: {
              type: 'array',
              description: 'Array de registros a insertar',
              items: { type: 'object' }
            }
          },
          required: ['records']
        }
      }
    ]
  };
});

// Manejar llamadas a herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_ventas': {
        let query = supabase.from('ventas').select('*');
        
        if (args.filters) {
          Object.entries(args.filters).forEach(([key, value]) => {
            if (key === 'fecha_inicio' && value) {
              query = query.gte('dia', value);
            } else if (key === 'fecha_fin' && value) {
              query = query.lte('dia', value);
            } else if (value) {
              query = query.eq(key, value);
            }
          });
        }
        
        query = query.limit(args.limit || 100);
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: data.length,
                data: data
              }, null, 2)
            }
          ]
        };
      }

      case 'aggregate_ventas': {
        // Consulta base
        let query = supabase.from('ventas').select('*');
        
        if (args.filters) {
          Object.entries(args.filters).forEach(([key, value]) => {
            if (value) query = query.eq(key, value);
          });
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Agrupar en memoria (Supabase free no tiene aggregates complejos)
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
        
        const result = Object.values(grouped);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: result.length,
                data: result
              }, null, 2)
            }
          ]
        };
      }

      case 'get_top_productos': {
        let query = supabase.from('ventas').select('*');
        
        if (args.filters) {
          Object.entries(args.filters).forEach(([key, value]) => {
            if (value) query = query.eq(key, value);
          });
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Ordenar en memoria
        const sorted = data.sort((a, b) => {
          const valA = parseFloat(a[args.orderBy] || 0);
          const valB = parseFloat(b[args.orderBy] || 0);
          return valB - valA; // Descendente
        });
        
        const top = sorted.slice(0, args.limit || 10);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: top.length,
                data: top
              }, null, 2)
            }
          ]
        };
      }

      case 'insert_ventas': {
        const { data, error } = await supabase
          .from('ventas')
          .insert(args.records);
        
        if (error) throw error;
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                inserted: args.records.length,
                message: 'Registros insertados exitosamente'
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
  console.error('MCP Supabase Server running');
}

main().catch(console.error);
