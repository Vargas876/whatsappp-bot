const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode-terminal');

// Configuración de Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const AUTHORIZED_USER_ID = process.env.AUTHORIZED_USER_ID;
const telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let isClientReady = false;
let isBotActive = true;

// Set para búsqueda O(1)
const targetNumbers = new Set([
    '573225932684@c.us',
    '573108105885@c.us',
    '573116817593@c.us',
    '573114979743@c.us',
    '573142126744@c.us',
    '573012406420@c.us',
    '573212315764@c.us',
    '573228635363@c.us',
    '573144181106@c.us',
    '573209133924@c.us',
    '573102901160@c.us',
    '573142126744@c.us'
]);

const ADMIN_NUMBER = '573228932335@c.us';
const COOLDOWN_TIME = 35 * 60 * 1000;

// Caché en memoria para respuestas rápidas
const responseCache = {
    isBlocked: false,
    lastRespondedNumber: null,
    blockUntil: null,
    pendingResponses: new Set(),
    initialResponses: new Set(),
    respondedMessages: new Map() // Nueva estructura para rastrear respuestas
};

// Verificación de bloqueo optimizada
const isSystemBlocked = () => responseCache.isBlocked && Date.now() < responseCache.blockUntil;

// Notificación asíncrona sin esperar respuesta
const sendNotificationToAdmin = async (message, isGroup, type = 'response') => {
    if (!isClientReady) return;

    try {
        const contact = await client.getContactById(isGroup ? message.author : message.from);
        const contactName = contact.name || contact.pushname || contact.number;

        let groupName = 'Unknown Group';
        if (isGroup) {
            const chat = await client.getChatById(message.from);
            groupName = chat.name || message.from;
        }

        const notificationText = type === 'response'
            ? `🤖 Respondido: ${isGroup ? `\nGrupo: ${groupName}\nA: ${contactName}` : `De: ${contactName}`}`
            : `🔒 Sistema bloqueado por: ${contactName}`;

        client.sendMessage(ADMIN_NUMBER, notificationText).catch(() => {});
    } catch (error) {
        console.error('Error getting contact/group info:', error);
    }
};

// Cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--disable-canvas-aa',
            '--disable-2d-canvas-clip-aa',
            '--disable-gl-drawing-for-tests',
            '--no-first-run',
            '--single-process',
            '--no-zygote'
        ]
    }
});

// Respuesta rápida precompilada
const FAST_RESPONSE = 'V.';

// Manejador de mensajes de WhatsApp
client.on('message', async (message) => {
    try {
        const senderId = message.from;
        const isGroup = senderId.endsWith('@g.us');
        const actualSender = isGroup ? message.author : senderId;

        // Verificación rápida O(1)
        if (!targetNumbers.has(isGroup ? message.author : senderId)) return;
        if (isSystemBlocked()) return;

        // Manejo de respuestas en paralelo
        if (message.hasQuotedMsg) {
            const quotedMsg = await message.getQuotedMessage();

            // Verificar si el mensaje citado ya existe en el caché de respuestas
            const originalMessageId = quotedMsg.id._serialized;
            const respondedNumbers = responseCache.respondedMessages.get(originalMessageId) || new Set();

            // Si el mensaje ya ha sido respondido por otro número objetivo
            if (respondedNumbers.size > 0 && targetNumbers.has(actualSender)) {
                Object.assign(responseCache, {
                    isBlocked: true,
                    lastRespondedNumber: actualSender,
                    blockUntil: Date.now() + COOLDOWN_TIME,
                    pendingResponses: new Set()
                });
                sendNotificationToAdmin(message, isGroup, 'blocked');
                return;
            }

            // Agregar el número actual a los números que han respondido
            respondedNumbers.add(actualSender);
            responseCache.respondedMessages.set(originalMessageId, respondedNumbers);

            // Lógica original de bloqueo por primer respondedor
            if (quotedMsg.fromMe && targetNumbers.has(actualSender)) {
                if (responseCache.pendingResponses.has(actualSender)) {
                    Object.assign(responseCache, {
                        isBlocked: true,
                        lastRespondedNumber: actualSender,
                        blockUntil: Date.now() + COOLDOWN_TIME,
                        pendingResponses: new Set()
                    });
                    sendNotificationToAdmin(message, isGroup, 'blocked');
                }
            }
            return;
        }

        // Respuesta instantánea para primer mensaje
        if (!responseCache.initialResponses.has(actualSender)) {
            // Envío inmediato sin esperar confirmación
            Promise.all([
                message.reply(FAST_RESPONSE),
                new Promise(resolve => {
                    responseCache.initialResponses.add(actualSender);
                    responseCache.pendingResponses.add(actualSender);
                    sendNotificationToAdmin(message, isGroup, 'response');
                    resolve();
                })
            ]).catch(() => {
                responseCache.pendingResponses.delete(actualSender);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    }
});

// Evento QR de WhatsApp
client.on('qr', (qr) => {
    console.log('='.repeat(50));
    console.log('Escanea este código QR en WhatsApp:');
    qrcode.generate(qr, {small: true});

    // Enviar notificación a Telegram
    if (TELEGRAM_TOKEN && AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(AUTHORIZED_USER_ID, '📱 Nuevo código QR generado. Revisa los logs de Render para escanearlo.');
    }
    console.log('='.repeat(50));
});

// Eventos de WhatsApp
client.on('ready', () => {
    isClientReady = true;
    console.log('WhatsApp Bot listo');
    if (TELEGRAM_TOKEN && AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(AUTHORIZED_USER_ID, '🤖 WhatsApp Bot está activo y funcionando');
    }
});

// Comandos de Telegram
telegramBot.onText(/\/status/, (msg) => {
    if (msg.from.id.toString() !== AUTHORIZED_USER_ID) return;
    telegramBot.sendMessage(msg.chat.id, '✅ Bot está funcionando');
});

telegramBot.onText(/\/info/, (msg) => {
    if (msg.from.id.toString() !== AUTHORIZED_USER_ID) return;
    const info = {
        isBlocked: isSystemBlocked(),
        blockTimeRemaining: responseCache.blockUntil ? Math.max(0, (responseCache.blockUntil - Date.now()) / 1000) : 0,
        lastResponder: responseCache.lastRespondedNumber,
        activeUsers: responseCache.initialResponses.size
    };
    telegramBot.sendMessage(msg.chat.id,
        `📊 Estado del Bot:\n` +
        `Bloqueado: ${info.isBlocked ? 'Sí' : 'No'}\n` +
        `Tiempo restante: ${Math.round(info.blockTimeRemaining)}s\n` +
        `Último respondedor: ${info.lastResponder || 'Ninguno'}\n` +
        `Usuarios activos: ${info.activeUsers}`
    );
});

// Manejo de errores de WhatsApp
client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
    if (TELEGRAM_TOKEN && AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(AUTHORIZED_USER_ID, '⚠️ Bot de WhatsApp desconectado. Reconectando...');
    }
    client.initialize();
});

// Inicialización
console.log('Iniciando bot...');
client.initialize();

// Manejo de errores globales
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (TELEGRAM_TOKEN && AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(AUTHORIZED_USER_ID, `❌ Error: ${err.message}`);
    }
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    if (TELEGRAM_TOKEN && AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(AUTHORIZED_USER_ID, `❌ Error: ${err.message}`);
    }
});