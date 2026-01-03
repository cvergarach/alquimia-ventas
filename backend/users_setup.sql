-- Script para crear tabla de usuarios en Supabase
-- Ejecutar en SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Insertar usuario administrador por defecto
-- Nota: En un entorno de producción real, las contraseñas deben estar hasheadas.
-- Para esta fase inicial de Alquimia, usaremos texto claro o un hash simple según se requiera.
INSERT INTO app_users (username, password, first_name, last_name, role)
VALUES ('admin', 'admin123', 'Administrador', 'Alquimia', 'admin')
ON CONFLICT (username) DO UPDATE SET password = 'admin123';

-- Habilitar RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura (ajustar luego para privacidad)
DROP POLICY IF EXISTS "Enable read access for app_users" ON app_users;
CREATE POLICY "Enable read access for app_users" ON app_users
  FOR SELECT USING (true);

-- Política para permitir inserción (solo admin podría ser, pero por ahora libre para desarrollo)
DROP POLICY IF EXISTS "Enable insert for all" ON app_users;
CREATE POLICY "Enable insert for all" ON app_users
  FOR INSERT WITH CHECK (true);

-- Política para permitir eliminación
DROP POLICY IF EXISTS "Enable delete for all" ON app_users;
CREATE POLICY "Enable delete for all" ON app_users
  FOR DELETE USING (true);
