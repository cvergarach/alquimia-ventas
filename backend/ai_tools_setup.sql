-- Script para crear tabla de herramientas de IA
-- Ejecutar en SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS ai_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  sql_template TEXT, -- Nueva columna para consultas personalizadas
  provider VARCHAR(50) DEFAULT 'supabase', -- 'supabase' o 'sheets'
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asegurar que la columna sql_template existe (por si la tabla ya fue creada antes)
ALTER TABLE ai_tools ADD COLUMN IF NOT EXISTS sql_template TEXT;

-- Habilitar RLS
ALTER TABLE ai_tools ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura a todos
DROP POLICY IF EXISTS "Enable read access for all" ON ai_tools;
CREATE POLICY "Enable read access for all" ON ai_tools
  FOR SELECT USING (true);

-- Política para permitir gestión total (esto debería estar restringido en prod)
DROP POLICY IF EXISTS "Enable all for admin" ON ai_tools;
CREATE POLICY "Enable all for admin" ON ai_tools
  FOR ALL USING (true);

-- Función para ejecutar consultas dinámicas generadas por la IA
-- NOTA: Esta función es potente, asegúrate de restringir los permisos del rol anon/authenticated.
CREATE OR REPLACE FUNCTION execute_ai_query(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    EXECUTE 'SELECT jsonb_agg(t) FROM (' || sql_query || ') t' INTO result;
    RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Insertar herramientas actuales como semilla (con manejo de duplicados)
INSERT INTO ai_tools (name, description, parameters, provider) VALUES
('get_summary_stats', 'OBTENER TOTALES RÁPIDOS. Retorna el gran total de unidades, ingresos y margen.', '{"type": "object", "properties": {"filters": {"type": "object"}}}', 'supabase'),
('query_ventas', 'VISTA DE DETALLE. Consulta transacciones individuales. Máximo 100 filas.', '{"type": "object", "properties": {"filters": {"type": "object"}, "limit": {"type": "number"}}}', 'supabase'),
('aggregate_ventas', 'PROCESAR TOTALES POR SEGMENTO. Úsalo para saber cuánto se vendió por canal, marca, etc.', '{"type": "object", "properties": {"groupBy": {"type": "array", "items": {"type": "string"}}, "filters": {"type": "object"}}, "required": ["groupBy"]}', 'supabase'),
('get_top_productos', 'Ranking de mejores productos por un criterio.', '{"type": "object", "properties": {"orderBy": {"type": "string"}, "limit": {"type": "number"}, "filters": {"type": "object"}}, "required": ["orderBy"]}', 'supabase'),
('get_performance_report', 'Compara el rendimiento de ventas con el día anterior y promedio móvil.', '{"type": "object", "properties": {"date": {"type": "string"}, "filters": {"type": "object"}}, "required": ["date"]}', 'supabase'),
('query_metas', 'Consulta metas de ventas desde Google Sheets.', '{"type": "object", "properties": {"filters": {"type": "object"}}}', 'sheets')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  parameters = EXCLUDED.parameters,
  provider = EXCLUDED.provider;
