import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
);

// Configuración
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY = 2000; // 2 segundos
const MAX_RETRY_DELAY = 60000; // 1 minuto
const KEEPALIVE_INTERVAL = 30000; // 30 segundos
const MESSAGE_TIMEOUT = 30000; // 30 segundos para enviar mensaje
const CONNECTION_TIMEOUT = 60000; // 60 segundos para conectar

// Estado global de WhatsApp
let sock = null;
let qrCodeData = null;
let isConnected = false;
let reconnectAttempts = 0;
let keepaliveInterval = null;
let isConnecting = false; // Flag para prevenir conexiones simultáneas
let connectionState = {
    connected: false,
    lastConnected: null,
    lastDisconnected: null,
    reconnectAttempts: 0,
    phoneNumber: null,
    qr: null,
    lastActivity: null,
    messagesSent: 0,
    messagesReceived: 0,
    errors: []
};

// Directorio para autenticación
const authDir = path.join(__dirname, 'whatsapp_auth');

// Crear directorio si no existe
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

/**
 * Sistema de logging estructurado
 */
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        module: 'WhatsApp',
        message,
        ...data
    };

    const emoji = {
        'INFO': 'ℹ️',
        'WARN': '⚠️',
        'ERROR': '❌',
        'SUCCESS': '✅',
        'DEBUG': '🔍'
    };

    console.log(`${emoji[level] || '📝'} [${timestamp}] [WhatsApp:${level}] ${message}`,
        Object.keys(data).length > 0 ? data : '');

    // Guardar errores en el estado
    if (level === 'ERROR') {
        connectionState.errors.push({
            timestamp,
            message,
            data
        });
        // Mantener solo los últimos 10 errores
        if (connectionState.errors.length > 10) {
            connectionState.errors.shift();
        }
    }
}

/**
 * Calcular delay con backoff exponencial
 */
function calculateBackoff(attempt) {
    return Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
}

/**
 * Validar que la conexión está lista
 */
function ensureConnected() {
    if (!sock) {
        throw new Error('Socket no inicializado');
    }

    if (!isConnected) {
        throw new Error('WhatsApp no conectado');
    }

    if (!sock.ws || sock.ws.readyState !== 1) {
        throw new Error(`WebSocket no está abierto (state: ${sock.ws?.readyState})`);
    }

    return true;
}

/**
 * Validar sesión guardada
 */
function validateSession() {
    const credsPath = path.join(authDir, 'creds.json');

    if (!fs.existsSync(credsPath)) {
        log('INFO', 'No hay sesión guardada');
        return false;
    }

    try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        const isValid = creds && creds.me && creds.me.id;
        log('INFO', 'Sesión validada', { valid: isValid });
        return isValid;
    } catch (error) {
        log('ERROR', 'Error validando sesión', { error: error.message });
        return false;
    }
}

/**
 * Guardar sesión en Supabase
 */
async function saveSessionToDatabase(phoneNumber) {
    try {
        const credsPath = path.join(authDir, 'creds.json');

        if (!fs.existsSync(credsPath)) {
            log('WARN', 'No hay creds.json para guardar');
            return false;
        }

        const sessionData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
                phone_number: phoneNumber,
                session_data: sessionData,
                last_connected: new Date().toISOString(),
                is_active: true
            }, {
                onConflict: 'phone_number'
            });

        if (error) {
            log('ERROR', 'Error guardando sesión en DB', { error: error.message });
            return false;
        }

        log('SUCCESS', 'Sesión guardada en Supabase', { phoneNumber });
        return true;
    } catch (error) {
        log('ERROR', 'Error guardando sesión', { error: error.message });
        return false;
    }
}

/**
 * Cargar sesión desde Supabase
 */
async function loadSessionFromDatabase(phoneNumber = null) {
    try {
        let query = supabase
            .from('whatsapp_sessions')
            .select('*')
            .eq('is_active', true)
            .order('last_connected', { ascending: false });

        if (phoneNumber) {
            query = query.eq('phone_number', phoneNumber);
        }

        const { data, error } = await query.limit(1).single();

        if (error || !data) {
            log('INFO', 'No hay sesión en DB', { phoneNumber });
            return false;
        }

        // Guardar en archivo local
        const credsPath = path.join(authDir, 'creds.json');
        fs.writeFileSync(credsPath, JSON.stringify(data.session_data, null, 2));

        log('SUCCESS', 'Sesión cargada desde Supabase', {
            phoneNumber: data.phone_number,
            lastConnected: data.last_connected
        });

        return data.phone_number;
    } catch (error) {
        log('ERROR', 'Error cargando sesión', { error: error.message });
        return false;
    }
}

/**
 * Enviar mensaje con reintentos
 */
async function sendMessageWithRetry(to, message, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            // Validar conexión
            ensureConnected();

            log('INFO', `Enviando mensaje (intento ${attempt + 1}/${retries})`, { to });

            // Enviar con timeout
            const sendPromise = sock.sendMessage(to, message);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout enviando mensaje')), MESSAGE_TIMEOUT)
            );

            await Promise.race([sendPromise, timeoutPromise]);

            connectionState.messagesSent++;
            connectionState.lastActivity = new Date().toISOString();
            log('SUCCESS', 'Mensaje enviado correctamente', { to });

            return true;
        } catch (error) {
            log('WARN', `Error enviando mensaje (intento ${attempt + 1}/${retries})`, {
                error: error.message,
                to
            });

            if (attempt === retries - 1) {
                log('ERROR', 'Falló envío de mensaje después de todos los reintentos', {
                    error: error.message,
                    to
                });
                throw error;
            }

            // Esperar antes de reintentar
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
    }
}

/**
 * Iniciar keepalive para mantener conexión activa
 */
let messageHandlerRef = null; // Guardar referencia al messageHandler para reconexión

function startKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
    }

    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    keepaliveInterval = setInterval(async () => {
        try {
            if (sock && sock.ws) {
                const state = sock.ws.readyState;
                if (state !== 1) { // 1 = OPEN
                    consecutiveFailures++;
                    log('WARN', 'WebSocket cerrado', {
                        state,
                        consecutiveFailures,
                        wasConnected: isConnected
                    });

                    isConnected = false;

                    // Si falla 3 veces seguidas, forzar reconexión
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && messageHandlerRef) {
                        log('ERROR', 'Socket cerrado persistentemente, forzando reconexión...');
                        consecutiveFailures = 0;

                        // Detener keepalive actual
                        stopKeepalive();

                        // Forzar reconexión
                        setTimeout(() => {
                            log('INFO', 'Ejecutando reconexión forzada');
                            connectWhatsApp(messageHandlerRef).catch(err => {
                                log('ERROR', 'Error en reconexión forzada', { error: err.message });
                            });
                        }, 2000);
                    }
                } else {
                    // Socket OK, resetear contador
                    if (consecutiveFailures > 0) {
                        log('INFO', 'Socket recuperado');
                        consecutiveFailures = 0;
                    }
                    connectionState.lastActivity = new Date().toISOString();
                }
            } else if (isConnected) {
                log('WARN', 'Socket no disponible pero marcado como conectado');
                isConnected = false;
                consecutiveFailures++;
            }
        } catch (error) {
            log('ERROR', 'Keepalive check falló', { error: error.message });
            consecutiveFailures++;
        }
    }, KEEPALIVE_INTERVAL);

    log('INFO', `Keepalive iniciado con reconexión agresiva (intervalo: ${KEEPALIVE_INTERVAL / 1000}s)`);
}

/**
 * Detener keepalive
 */
function stopKeepalive() {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
        log('INFO', 'Keepalive detenido');
    }
}

/**
 * Conectar a WhatsApp
 * @param {Function} messageHandler - Función para procesar mensajes recibidos
 */
export async function connectWhatsApp(messageHandler) {
    try {
        // Prevenir conexiones simultáneas
        if (isConnecting) {
            log('WARN', 'Ya hay una conexión en progreso, ignorando intento duplicado');
            return { success: false, message: 'Connection already in progress' };
        }

        isConnecting = true;

        // Guardar referencia para reconexión agresiva
        messageHandlerRef = messageHandler;

        log('INFO', 'Iniciando conexión a WhatsApp...');

        // Intentar cargar sesión desde Supabase primero
        if (!hasStoredSession()) {
            log('INFO', 'No hay sesión local, intentando cargar desde Supabase...');
            await loadSessionFromDatabase();
        }

        // Validar sesión si existe
        if (hasStoredSession()) {
            if (!validateSession()) {
                log('WARN', 'Sesión inválida, se requerirá nuevo QR');
            }
        }

        const { version } = await fetchLatestBaileysVersion();
        log('INFO', 'Baileys version obtenida', { version });

        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['Alquimia Dashboard', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            syncFullHistory: false,
            printQRInTerminal: false,
            connectTimeoutMs: CONNECTION_TIMEOUT
        });

        log('INFO', 'Socket creado correctamente');

        // Guardar credenciales
        sock.ev.on('creds.update', saveCreds);

        // Manejar actualizaciones de conexión
        sock.ev.on('connection.update', async (update) => {
            try {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    qrCodeData = await QRCode.toDataURL(qr);
                    connectionState.qr = qrCodeData;
                    reconnectAttempts = 0;
                    log('INFO', 'QR code generado');
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    log('WARN', 'Conexión cerrada', {
                        statusCode,
                        reason: DisconnectReason[statusCode] || 'Unknown',
                        shouldReconnect
                    });

                    isConnected = false;
                    connectionState.connected = false;
                    connectionState.lastDisconnected = new Date().toISOString();
                    qrCodeData = null;
                    connectionState.qr = null;

                    stopKeepalive();

                    if (statusCode === DisconnectReason.loggedOut) {
                        log('ERROR', 'Sesión cerrada (logged out). Se requiere nuevo QR');
                        reconnectAttempts = 0;
                        connectionState.reconnectAttempts = 0;
                        return;
                    }

                    if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        const delay = calculateBackoff(reconnectAttempts);
                        reconnectAttempts++;
                        connectionState.reconnectAttempts = reconnectAttempts;

                        log('INFO', `Reintentando conexión`, {
                            attempt: reconnectAttempts,
                            maxAttempts: MAX_RECONNECT_ATTEMPTS,
                            delayMs: delay
                        });

                        setTimeout(() => connectWhatsApp(messageHandler), delay);
                    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                        log('ERROR', 'Máximo de intentos de reconexión alcanzado');
                        reconnectAttempts = 0;
                        connectionState.reconnectAttempts = 0;
                    }
                } else if (connection === 'open') {
                    log('SUCCESS', '¡Conectado a WhatsApp exitosamente!');
                    isConnected = true;
                    isConnecting = false; // Resetear flag de conexión
                    connectionState.connected = true;
                    connectionState.lastConnected = new Date().toISOString();
                    connectionState.lastActivity = new Date().toISOString();
                    qrCodeData = null;
                    connectionState.qr = null;
                    reconnectAttempts = 0;
                    connectionState.reconnectAttempts = 0;

                    startKeepalive();

                    try {
                        const user = sock.user;
                        if (user) {
                            connectionState.phoneNumber = user.id.split(':')[0];
                            log('INFO', 'Número conectado', { phoneNumber: connectionState.phoneNumber });

                            // Guardar sesión en Supabase
                            await saveSessionToDatabase(connectionState.phoneNumber);
                        }
                    } catch (error) {
                        log('WARN', 'No se pudo obtener número de teléfono', { error: error.message });
                    }
                }
            } catch (error) {
                log('ERROR', 'Error en connection.update handler', { error: error.message });
            }
        });

        // Manejar mensajes entrantes con respuesta inmediata
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];

                if (!msg.message) return;
                if (msg.key.fromMe) return;

                const from = msg.key.remoteJid;
                const text = msg.message.conversation ||
                    msg.message.extendedTextMessage?.text || '';

                if (!text) return;

                connectionState.messagesReceived++;
                log('INFO', 'Mensaje recibido', { from, length: text.length });
                connectionState.lastActivity = new Date().toISOString();

                // Enviar "typing" inmediatamente
                try {
                    await sock.sendPresenceUpdate('composing', from);
                } catch (error) {
                    log('WARN', 'No se pudo enviar typing', { error: error.message });
                }

                // Responder INMEDIATAMENTE para mantener conexión activa
                try {
                    await sendMessageWithRetry(from, {
                        text: '⏳ Procesando tu consulta...'
                    });
                    log('SUCCESS', 'Respuesta inmediata enviada');
                } catch (error) {
                    log('ERROR', 'Error enviando respuesta inmediata', { error: error.message });
                }

                // Procesar en background (no bloquea)
                (async () => {
                    try {
                        log('INFO', 'Iniciando procesamiento en background');

                        // Procesar mensaje (puede tardar varios segundos)
                        const response = await messageHandler(text, from);

                        log('INFO', 'Procesamiento completado, enviando respuesta');

                        // Verificar conexión antes de enviar
                        if (!isConnected || !sock || sock.ws?.readyState !== 1) {
                            log('WARN', 'Conexión perdida, esperando reconexión...');

                            // Esperar hasta 30 segundos para reconexión
                            for (let i = 0; i < 30; i++) {
                                await new Promise(r => setTimeout(r, 1000));
                                if (isConnected && sock && sock.ws?.readyState === 1) {
                                    log('INFO', 'Conexión recuperada');
                                    break;
                                }
                            }
                        }

                        // Enviar respuesta final
                        await sendMessageWithRetry(from, { text: response });
                        log('SUCCESS', 'Respuesta final enviada', { from });

                    } catch (error) {
                        log('ERROR', 'Error en procesamiento background', {
                            error: error.message,
                            stack: error.stack
                        });

                        // Intentar enviar mensaje de error
                        try {
                            await sendMessageWithRetry(from, {
                                text: '❌ Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo.'
                            });
                        } catch (sendError) {
                            log('ERROR', 'No se pudo enviar mensaje de error', { error: sendError.message });
                        }
                    }
                })();

            } catch (error) {
                log('ERROR', 'Error procesando mensaje', {
                    error: error.message,
                    stack: error.stack
                });
            }
        });

        return { success: true };
    } catch (error) {
        isConnecting = false; // Resetear flag en caso de error
        log('ERROR', 'Error al conectar WhatsApp', {
            error: error.message,
            stack: error.stack
        });

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = calculateBackoff(reconnectAttempts);
            reconnectAttempts++;
            log('INFO', `Reintentando en ${delay}ms...`);
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
        messagesSent: connectionState.messagesSent,
        messagesReceived: connectionState.messagesReceived,
        recentErrors: connectionState.errors.slice(-5),
        timestamp: new Date().toISOString()
    };
}

/**
 * Obtener health check detallado
 */
export function getHealth() {
    const status = getStatus();
    const socketState = sock?.ws?.readyState;
    const socketStateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];

    return {
        ...status,
        socketState: socketState !== undefined ? socketStateNames[socketState] : 'NOT_INITIALIZED',
        socketStateCode: socketState,
        healthy: isConnected && socketState === 1,
        hasSession: hasStoredSession(),
        sessionValid: validateSession()
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
    log('INFO', 'Desconectando WhatsApp...');
    stopKeepalive();

    if (sock) {
        try {
            sock.end();
        } catch (error) {
            log('WARN', 'Error al cerrar socket', { error: error.message });
        }
        sock = null;
    }

    isConnected = false;
    connectionState.connected = false;
    connectionState.lastDisconnected = new Date().toISOString();
    qrCodeData = null;
    connectionState.qr = null;
    reconnectAttempts = 0;
    connectionState.reconnectAttempts = 0;

    log('INFO', 'WhatsApp desconectado');
    return { success: true };
}

/**
 * Eliminar sesión guardada
 */
export function clearSession() {
    log('INFO', 'Eliminando sesión guardada...');
    disconnect();

    try {
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            fs.mkdirSync(authDir, { recursive: true });
            log('SUCCESS', 'Sesión eliminada correctamente');
        }

        connectionState = {
            connected: false,
            lastConnected: null,
            lastDisconnected: null,
            reconnectAttempts: 0,
            phoneNumber: null,
            qr: null,
            lastActivity: null,
            messagesSent: 0,
            messagesReceived: 0,
            errors: []
        };

        return { success: true, message: 'Sesión eliminada correctamente' };
    } catch (error) {
        log('ERROR', 'Error eliminando sesión', { error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Reiniciar conexión
 */
export async function restart(messageHandler) {
    log('INFO', 'Reiniciando conexión WhatsApp...');
    disconnect();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return connectWhatsApp(messageHandler);
}
