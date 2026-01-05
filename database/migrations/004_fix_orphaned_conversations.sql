-- Script para arreglar conversaciones huérfanas
-- Este script crea conversaciones para los mensajes que no tienen una conversación asociada

-- Paso 1: Ver conversation_ids que existen en messages pero no en conversations
SELECT DISTINCT m.conversation_id, 
       MIN(m.created_at) as first_message_time,
       COUNT(*) as message_count
FROM messages m
LEFT JOIN conversations c ON m.conversation_id = c.id
WHERE c.id IS NULL
GROUP BY m.conversation_id;

-- Paso 2: Crear conversaciones para esos IDs huérfanos
-- IMPORTANTE: Ejecutar esto solo después de revisar el resultado del Paso 1
INSERT INTO conversations (id, user_id, phone_number, channel, title, created_at, updated_at)
SELECT DISTINCT 
    m.conversation_id as id,
    NULL as user_id,
    NULL as phone_number,
    'web' as channel,
    SUBSTRING(MIN(CASE WHEN m.role = 'user' THEN m.content END), 1, 50) || '...' as title,
    MIN(m.created_at) as created_at,
    MAX(m.created_at) as updated_at
FROM messages m
LEFT JOIN conversations c ON m.conversation_id = c.id
WHERE c.id IS NULL
GROUP BY m.conversation_id
ON CONFLICT (id) DO NOTHING;

-- Paso 3: Verificar que todas las conversaciones ahora existen
SELECT 
    (SELECT COUNT(*) FROM conversations) as total_conversations,
    (SELECT COUNT(DISTINCT conversation_id) FROM messages) as total_conversation_ids_in_messages,
    (SELECT COUNT(DISTINCT m.conversation_id) 
     FROM messages m 
     LEFT JOIN conversations c ON m.conversation_id = c.id 
     WHERE c.id IS NULL) as orphaned_conversations;
