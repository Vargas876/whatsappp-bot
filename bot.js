const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal'); // Cambiamos a qrcode-terminal
const fs = require('fs');
const path = require('path');
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

// Eventos optimizados sin bloqueo
client.on('qr', (qr) => {
    console.log('='.repeat(50));
    console.log('Escanea este código QR en WhatsApp:');
    qrcode.generate(qr, {small: true}); // Esto mostrará el QR en la terminal
    console.log('='.repeat(50));
});

client.on('ready', () => {
    isClientReady = true;
    // Notificación asíncrona
    setTimeout(() => {
        client.sendMessage(ADMIN_NUMBER, '🤖 Bot Activo').catch(() => {});
    }, 0);
});

// Reconexión optimizada
client.on('disconnected', () => setTimeout(() => client.initialize(), 0));
client.on('auth_failure', () => setTimeout(() => client.initialize(), 0));

// Inicio inmediato
client.initialize();
//Tiki

// Cierre limpio y rápido
const handleShutdown = () => {
    client.destroy().finally(() => process.exit(0));
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
