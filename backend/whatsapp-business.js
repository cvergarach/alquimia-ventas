import axios from 'axios';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_VERSION = 'v18.0';
const API_URL = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

/**
 * Enviar mensaje de texto vía WhatsApp Business API
 * @param {string} to - Número de teléfono (formato: 56987200577)
 * @param {string} text - Texto del mensaje
 */
export async function sendMessage(to, text) {
    try {
        console.log(`📤 Enviando mensaje a ${to}:`, text.substring(0, 50) + '...');

        const response = await axios.post(
            API_URL,
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: {
                    preview_url: false,
                    body: text
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        console.log('✅ Mensaje enviado exitosamente:', {
            messageId: response.data.messages?.[0]?.id,
            to: to
        });

        return {
            success: true,
            messageId: response.data.messages?.[0]?.id,
            data: response.data
        };
    } catch (error) {
        console.error('❌ Error enviando mensaje:', {
            error: error.response?.data || error.message,
            to: to
        });

        throw new Error(error.response?.data?.error?.message || error.message);
    }
}

/**
 * Marcar mensaje como leído
 * @param {string} messageId - ID del mensaje a marcar como leído
 */
export async function markAsRead(messageId) {
    try {
        await axios.post(
            API_URL,
            {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            },
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            }
        );

        console.log('✅ Mensaje marcado como leído:', messageId);
    } catch (error) {
        console.error('⚠️ Error marcando como leído:', error.message);
        // No lanzar error - esto no es crítico
    }
}

/**
 * Enviar indicador de "escribiendo..."
 * @param {string} to - Número de teléfono
 */
export async function sendTypingIndicator(to) {
    try {
        // WhatsApp Business API no tiene typing indicator directo
        // Pero podemos enviar una reacción temporal
        console.log('⌨️ Usuario escribiendo:', to);
    } catch (error) {
        console.error('⚠️ Error enviando typing:', error.message);
    }
}

/**
 * Obtener información del perfil
 * @param {string} phoneNumber - Número de teléfono
 */
export async function getProfile(phoneNumber) {
    try {
        const response = await axios.get(
            `https://graph.facebook.com/${API_VERSION}/${phoneNumber}/profile`,
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                },
                params: {
                    fields: 'name,profile_picture_url'
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('⚠️ Error obteniendo perfil:', error.message);
        return null;
    }
}

/**
 * Validar configuración
 */
export function validateConfig() {
    const errors = [];

    if (!PHONE_NUMBER_ID) {
        errors.push('WHATSAPP_PHONE_NUMBER_ID no configurado');
    }

    if (!ACCESS_TOKEN) {
        errors.push('WHATSAPP_ACCESS_TOKEN no configurado');
    }

    if (errors.length > 0) {
        console.error('❌ Configuración de WhatsApp Business API incompleta:', errors);
        return false;
    }

    console.log('✅ Configuración de WhatsApp Business API válida');
    return true;
}

/**
 * Obtener estado de la API
 */
export async function getAPIStatus() {
    try {
        // Verificar que podemos hacer requests a la API
        const response = await axios.get(
            `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                },
                params: {
                    fields: 'verified_name,code_verification_status,quality_rating'
                },
                timeout: 5000
            }
        );

        return {
            healthy: true,
            phoneNumberId: PHONE_NUMBER_ID,
            verifiedName: response.data.verified_name,
            status: response.data.code_verification_status,
            qualityRating: response.data.quality_rating
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.response?.data?.error?.message || error.message
        };
    }
}

// Validar al importar
validateConfig();
