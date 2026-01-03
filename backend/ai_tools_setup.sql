-- Script para crear tabla de herramientas de IA
-- Ejecutar en SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS ai_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  provider VARCHAR(50) DEFAULT 'supabase', -- 'supabase' o 'sheets'
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE ai_tools ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura a todos
CREATE POLICY "Enable read access for all" ON ai_tools
  FOR SELECT USING (true);

-- Política para permitir gestión total (esto debería estar restringido en prod)
CREATE POLICY "Enable all for admin" ON ai_tools
  FOR ALL USING (true);

-- Insertar herramientas actuales como semilla
INSERT INTO ai_tools (name, description, parameters, provider) VALUES
('get_summary_stats', 'OBTENER TOTALES RÁPIDOS. Retorna el gran total de unidades, ingresos y margen.', '{"type": "object", "properties": {"filters": {"type": "object"}}}', 'supabase'),
('query_ventas', 'VISTA DE DETALLE. Consulta transacciones individuales. Máximo 100 filas.', '{"type": "object", "properties": {"filters": {"type": "object"}, "limit": {"type": "number"}}}', 'supabase'),
('aggregate_ventas', 'PROCESAR TOTALES POR SEGMENTO. Úsalo para saber cuánto se vendió por canal, marca, etc.', '{"type": "object", "properties": {"groupBy": {"type": "array", "items": {"type": "string"}}, "filters": {"type": "object"}}, "required": ["groupBy"]}', 'supabase'),
('get_top_productos', 'Ranking de mejores productos por un criterio.', '{"type": "object", "properties": {"orderBy": {"type": "string"}, "limit": {"type": "number"}, "filters": {"type": "object"}}, "required": ["orderBy"]}', 'supabase'),
('get_performance_report', 'Compara el rendimiento de ventas con el día anterior y promedio móvil.', '{"type": "object", "properties": {"date": {"type": "string"}, "filters": {"type": "object"}}, "required": ["date"]}', 'supabase'),
('query_metas', 'Consulta metas de ventas desde Google Sheets.', '{"type": "object", "properties": {"filters": {"type": "object"}}}', 'sheets');
