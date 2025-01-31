const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Telegram Bot Configuration
const TELEGRAM_TOKEN = '7831188456:AAGWbs2PUSC1E7tSuzBvR_OyoF7f8DKhS8Q';
const AUTHORIZED_USER_ID = '5573246970';
const ADMIN_NUMBER = '573228932335@c.us';

// Existing configurations
const QR_PATH = path.join(__dirname, 'qr-code.png');
let isClientReady = false;
let telegramBot = null;

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

const COOLDOWN_TIME = 35 * 60 * 1000;

// Caché en memoria para respuestas rápidas
const responseCache = {
    isBlocked: false,
    lastRespondedNumber: null,
    blockUntil: null,
    pendingResponses: new Set(),
    initialResponses: new Set(),
    respondedMessages: new Map()
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

        // Send to Telegram and WhatsApp admin
        if (telegramBot && AUTHORIZED_USER_ID) {
            await telegramBot.sendMessage(AUTHORIZED_USER_ID, notificationText);
        }
        client.sendMessage(ADMIN_NUMBER, notificationText).catch(() => {});
    } catch (error) {
        console.error('Error getting contact/group info:', error);
    }
};

// Cliente optimizado con configuración mínima
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

// Manejador de mensajes optimizado
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

// Eventos QR con notificación a Telegram
client.on('qr', async (qr) => {
    try {
        // Generar archivo QR local
        await qrcode.toFile(QR_PATH, qr, {
            color: { dark: '#000000', light: '#ffffff' },
            width: 800,
            margin: 1
        });

        // Generar buffer para Telegram
        const qrBuffer = await qrcode.toBuffer(qr, {
            type: 'png',
            margin: 4,
            width: 512,
            errorCorrectionLevel: 'H'
        });

        // Enviar QR por Telegram si está configurado
        if (telegramBot && AUTHORIZED_USER_ID) {
            await telegramBot.sendPhoto(
                AUTHORIZED_USER_ID,
                qrBuffer,
                { caption: '📱 Nuevo código QR generado. Por favor, escanea.' }
            );
        }
    } catch (qrError) {
        console.error('Error al generar QR:', qrError);
    }
});

// Eventos de estado del cliente con notificaciones
client.on('ready', () => {
    isClientReady = true;

    // Notificaciones a Telegram y WhatsApp admin
    if (telegramBot && AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(AUTHORIZED_USER_ID, '🤖 Bot WhatsApp Activo');
    }

    // Enviar mensaje al número de admin en WhatsApp
    setTimeout(() => {
        client.sendMessage(ADMIN_NUMBER, '🤖 Bot Activo').catch(() => {});
    }, 0);
});

// Inicializar Telegram Bot
try {
    telegramBot = new TelegramBot(TELEGRAM_TOKEN, {
        polling: true,
        filepath: false
    });

    // Comando /start - Reinicia el bot de WhatsApp
    telegramBot.onText(/\/start/, async (msg) => {
        if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
            return telegramBot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        }

        await telegramBot.sendMessage(msg.chat.id, '🔄 Reiniciando WhatsApp Bot...');
        try {
            // Destruir cliente existente si está activo
            if (client) {
                await client.destroy();
            }

            // Reiniciar cliente
            client.initialize();
            await telegramBot.sendMessage(msg.chat.id, '✅ Bot reiniciado. Esperando código QR...');
        } catch (error) {
            console.error('Error al reiniciar WhatsApp:', error);
            await telegramBot.sendMessage(msg.chat.id, '❌ Error al reiniciar el bot: ' + error.message);
        }
    });

    // Comando /stop - Detiene el bot de WhatsApp
    telegramBot.onText(/\/stop/, async (msg) => {
        if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
            return telegramBot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        }

        await telegramBot.sendMessage(msg.chat.id, '🛑 Deteniendo WhatsApp Bot...');
        try {
            await client.destroy();
            await telegramBot.sendMessage(msg.chat.id, '✅ Bot detenido correctamente');
        } catch (error) {
            console.error('Error al detener WhatsApp:', error);
            await telegramBot.sendMessage(msg.chat.id, '❌ Error al detener el bot: ' + error.message);
        }
    });

    console.log('Telegram Bot iniciado');
} catch (err) {
    console.error('Error al iniciar Telegram:', err);
}

// Reconexión optimizada
client.on('disconnected', () => setTimeout(() => client.initialize(), 0));
client.on('auth_failure', () => setTimeout(() => client.initialize(), 0));

// Inicio inmediato
client.initialize();

// Cierre limpio y rápido
const handleShutdown = () => {
    if (client) {
        client.destroy().finally(() => process.exit(0));
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);