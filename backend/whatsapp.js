import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY = 2000; // 2 segundos
const MAX_RETRY_DELAY = 60000; // 1 minuto
const KEEPALIVE_INTERVAL = 30000; // 30 segundos

// Estado global de WhatsApp
let sock = null;
let qrCodeData = null;
let isConnected = false;
let reconnectAttempts = 0;
let keepaliveInterval = null;
let connectionState = {
    connected: false,
    lastConnected: null,
    lastDisconnected: null,
    reconnectAttempts: 0,
    phoneNumber: null,
    qr: null,
    lastActivity: null
};

// Directorio para autenticación
const authDir = path.join(__dirname, 'whatsapp_auth');

// Crear directorio si no existe
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

/**
 * Calcular delay con backoff exponencial
 */
function calculateBackoff(attempt) {
    return Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
}

/**
 * Iniciar keepalive para mantener conexión activa
 */
function startKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
    }

    keepaliveInterval = setInterval(() => {
        try {
            if (sock && sock.ws) {
                const state = sock.ws.readyState;
                if (state !== 1) { // 1 = OPEN
                    console.warn('⚠️  WebSocket not open (state: ' + state + '), will reconnect on next check');
                    isConnected = false;
                } else {
                    connectionState.lastActivity = new Date().toISOString();
                }
            }
        } catch (error) {
            console.error('❌ Keepalive check failed:', error);
        }
    }, KEEPALIVE_INTERVAL);

    console.log(`💓 Keepalive started (every ${KEEPALIVE_INTERVAL / 1000}s)`);
}

/**
 * Detener keepalive
 */
function stopKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
        console.log('💔 Keepalive stopped');
    }
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
            syncFullHistory: false,
            printQRInTerminal: false
        });

        // Guardar credenciales
        sock.ev.on('creds.update', saveCreds);

        // Manejar actualizaciones de conexión
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Generar QR code como data URL
                qrCodeData = await QRCode.toDataURL(qr);
                connectionState.qr = qrCodeData;
                reconnectAttempts = 0;
                console.log('📱 Nuevo QR generado');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log('⚠️  Conexión cerrada. Código:', statusCode);

                isConnected = false;
                connectionState.connected = false;
                connectionState.lastDisconnected = new Date().toISOString();
                qrCodeData = null;
                connectionState.qr = null;

                // Detener keepalive
                stopKeepalive();

                // Manejar diferentes razones de desconexión
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('❌ Sesión cerrada (logged out). Se requiere nuevo QR.');
                    reconnectAttempts = 0;
                    return;
                }

                if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    const delay = calculateBackoff(reconnectAttempts);
                    reconnectAttempts++;
                    connectionState.reconnectAttempts = reconnectAttempts;

                    console.log(`🔄 Reintentando conexión en ${delay}ms (intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

                    setTimeout(() => connectWhatsApp(messageHandler), delay);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.log('❌ Máximo de intentos de reconexión alcanzado.');
                    reconnectAttempts = 0;
                    connectionState.reconnectAttempts = 0;
                }
            } else if (connection === 'open') {
                console.log('✅ ¡Conectado a WhatsApp exitosamente!');
                isConnected = true;
                connectionState.connected = true;
                connectionState.lastConnected = new Date().toISOString();
                connectionState.lastActivity = new Date().toISOString();
                qrCodeData = null;
                connectionState.qr = null;
                reconnectAttempts = 0;
                connectionState.reconnectAttempts = 0;

                // Iniciar keepalive
                startKeepalive();

                // Obtener info del número conectado
                try {
                    const user = sock.user;
                    if (user) {
                        connectionState.phoneNumber = user.id.split(':')[0];
                        console.log(`📞 Número conectado: ${connectionState.phoneNumber}`);
                    }
                } catch (error) {
                    console.warn('⚠️  No se pudo obtener número de teléfono');
                }
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
                connectionState.lastActivity = new Date().toISOString();

                // Mostrar "escribiendo..."
                await sock.sendPresenceUpdate('composing', from);

                // Procesar mensaje con el handler proporcionado (pasar número de teléfono)
                const response = await messageHandler(text, from);

                // Enviar respuesta
                await sock.sendMessage(from, { text: response });

                console.log(`✅ Respuesta enviada a WhatsApp`);
                connectionState.lastActivity = new Date().toISOString();
            } catch (error) {
                console.error('❌ Error procesando mensaje de WhatsApp:', error);
            }
        });

        return { success: true };
    } catch (error) {
        console.error('❌ Error al conectar WhatsApp:', error);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = calculateBackoff(reconnectAttempts);
            reconnectAttempts++;
            console.log(`🔄 Reintentando en ${delay}ms...`);
            setTimeout(() => connectWhatsApp(messageHandler), delay);
        }
        throw error;
    }
}

/**
 * Obtener estado actual de WhatsApp con detalles
 */
export function getStatus() {
    const uptime = connectionState.lastConnected
        ? Date.now() - new Date(connectionState.lastConnected).getTime()
        : 0;

    return {
        connected: isConnected,
        qr: qrCodeData,
        hasQR: qrCodeData !== null,
        reconnectAttempts: connectionState.reconnectAttempts,
        phoneNumber: connectionState.phoneNumber,
        lastConnected: connectionState.lastConnected,
        lastDisconnected: connectionState.lastDisconnected,
        lastActivity: connectionState.lastActivity,
        uptime: uptime,
        timestamp: new Date().toISOString()
    };
}

/**
 * Verificar si hay sesión guardada
 */
export function hasStoredSession() {
    const credsPath = path.join(authDir, 'creds.json');
    return fs.existsSync(credsPath);
}

/**
 * Desconectar WhatsApp
 */
export function disconnect() {
    stopKeepalive();

    if (sock) {
        sock.end();
        sock = null;
    }
    isConnected = false;
    connectionState.connected = false;
    connectionState.lastDisconnected = new Date().toISOString();
    qrCodeData = null;
    connectionState.qr = null;
    reconnectAttempts = 0;
    connectionState.reconnectAttempts = 0;

    console.log('📱 WhatsApp desconectado');
    return { success: true };
}

/**
 * Eliminar sesión guardada
 */
export function clearSession() {
    disconnect();

    try {
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            fs.mkdirSync(authDir, { recursive: true });
            console.log('🗑️  Sesión de WhatsApp eliminada');
        }

        connectionState = {
            connected: false,
            lastConnected: null,
            lastDisconnected: null,
            reconnectAttempts: 0,
            phoneNumber: null,
            qr: null,
            lastActivity: null
        };

        return { success: true, message: 'Sesión eliminada correctamente' };
    } catch (error) {
        console.error('❌ Error eliminando sesión:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Reiniciar conexión
 */
export async function restart(messageHandler) {
    disconnect();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return connectWhatsApp(messageHandler);
}
