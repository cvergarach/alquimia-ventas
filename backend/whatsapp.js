import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Estado global de WhatsApp
let sock = null;
let qrCodeData = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_ATTEMPTS = 3;

// Directorio para autenticación
const authDir = path.join(__dirname, 'whatsapp_auth');

// Crear directorio si no existe
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

/**
 * Conectar a WhatsApp
 * @param {Function} messageHandler - Función para procesar mensajes recibidos
 */
export async function connectWhatsApp(messageHandler) {
    try {
        console.log('📱 Iniciando conexión a WhatsApp...');

        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['Alquimia Dashboard', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
        });

        // Guardar credenciales
        sock.ev.on('creds.update', saveCreds);

        // Manejar actualizaciones de conexión
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Generar QR code como data URL
                qrCodeData = await QRCode.toDataURL(qr);
                connectionAttempts = 0;
                console.log('📱 Nuevo QR generado');
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('⚠️  Conexión cerrada. Razón:', lastDisconnect?.error?.output?.statusCode);

                isConnected = false;
                qrCodeData = null;

                if (shouldReconnect && connectionAttempts < MAX_ATTEMPTS) {
                    connectionAttempts++;
                    console.log(`🔄 Reintentando conexión (${connectionAttempts}/${MAX_ATTEMPTS})...`);
                    setTimeout(() => connectWhatsApp(messageHandler), 5000);
                } else if (connectionAttempts >= MAX_ATTEMPTS) {
                    console.log('❌ Máximo de intentos alcanzado.');
                    connectionAttempts = 0;
                }
            } else if (connection === 'open') {
                console.log('✅ ¡Conectado a WhatsApp exitosamente!');
                isConnected = true;
                qrCodeData = null;
                connectionAttempts = 0;
            }
        });

        // Manejar mensajes entrantes
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];

                // Ignorar mensajes sin contenido o propios
                if (!msg.message) return;
                if (msg.key.fromMe) return;

                const from = msg.key.remoteJid;
                const text = msg.message.conversation ||
                    msg.message.extendedTextMessage?.text || '';

                if (!text) return;

                console.log(`📩 WhatsApp mensaje de ${from}: ${text}`);

                // Mostrar "escribiendo..."
                await sock.sendPresenceUpdate('composing', from);

                // Procesar mensaje con el handler proporcionado
                const response = await messageHandler(text);

                // Enviar respuesta
                await sock.sendMessage(from, { text: response });

                console.log(`✅ Respuesta enviada a WhatsApp`);
            } catch (error) {
                console.error('❌ Error procesando mensaje de WhatsApp:', error);
            }
        });

        return { success: true };
    } catch (error) {
        console.error('❌ Error al conectar WhatsApp:', error);
        if (connectionAttempts < MAX_ATTEMPTS) {
            connectionAttempts++;
            setTimeout(() => connectWhatsApp(messageHandler), 5000);
        }
        throw error;
    }
}

/**
 * Obtener estado actual de WhatsApp
 */
export function getStatus() {
    return {
        connected: isConnected,
        qr: qrCodeData,
        hasQR: qrCodeData !== null,
        connectionAttempts,
        timestamp: new Date().toISOString()
    };
}

/**
 * Desconectar WhatsApp
 */
export function disconnect() {
    if (sock) {
        sock.end();
        sock = null;
    }
    isConnected = false;
    qrCodeData = null;
    connectionAttempts = 0;
    console.log('📱 WhatsApp desconectado');
    return { success: true };
}

/**
 * Reiniciar conexión
 */
export async function restart(messageHandler) {
    disconnect();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return connectWhatsApp(messageHandler);
}
