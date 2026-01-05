-- Migración para almacenar sesiones de WhatsApp en Supabase
-- Esto permite persistir las credenciales entre reinicios del servidor

-- Tabla para almacenar las credenciales de autenticación de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  session_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_connected TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Índice para búsqueda rápida por número
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_active ON whatsapp_sessions(is_active);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_session_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_session_updated_at();

-- Comentarios
COMMENT ON TABLE whatsapp_sessions IS 'Almacena las credenciales de sesión de WhatsApp para persistencia entre reinicios';
COMMENT ON COLUMN whatsapp_sessions.phone_number IS 'Número de teléfono conectado (formato: 1234567890)';
COMMENT ON COLUMN whatsapp_sessions.session_data IS 'Datos de sesión de Baileys (creds.json completo)';
COMMENT ON COLUMN whatsapp_sessions.is_active IS 'Indica si la sesión está activa';
