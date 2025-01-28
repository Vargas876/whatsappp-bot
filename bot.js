const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const QR_PATH = path.join(__dirname, 'qr-code.png');
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

        client.sendMessage(ADMIN_NUMBER, notificationText).catch(() => {});
    } catch (error) {
        console.error('Error getting contact/group info:', error);
    }
};

// Cliente optimizado para Termux
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/data/data/com.termux/files/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins',
            '--disable-site-isolation-trials',
            '--no-experiments',
            '--ignore-gpu-blacklist',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--disable-extensions',
            '--disable-default-apps',
            '--enable-features=NetworkService',
            '--no-default-browser-check',
            '--no-first-run',
            '--disable-notifications',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-networking',
            '--no-zygote',
            '--single-process'
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
        console.error('Error en el manejo del mensaje:', error);
    }
});

// Manejo mejorado del código QR
client.on('qr', async (qr) => {
    try {
        await qrcode.toFile(QR_PATH, qr, {
            color: { dark: '#000000', light: '#ffffff' },
            width: 800,
            margin: 1
        });
        console.log('🔄 Nuevo código QR generado en:', QR_PATH);
    } catch (error) {
        console.error('Error al generar QR:', error);
    }
});

// Eventos de estado del cliente
client.on('ready', () => {
    isClientReady = true;
    console.log('🤖 Bot activo y funcionando!');
    client.sendMessage(ADMIN_NUMBER, '🤖 Bot Activo').catch(() => {});
});

client.on('auth_failure', () => {
    console.log('❌ Error de autenticación, reintentando...');
    setTimeout(() => client.initialize(), 5000);
});

client.on('disconnected', (reason) => {
    console.log('📴 Bot desconectado:', reason);
    setTimeout(() => client.initialize(), 5000);
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
    console.error('Error no capturado:', err);
    // Mantenemos el bot funcionando
});

process.on('unhandledRejection', (err) => {
    console.error('Promesa rechazada no manejada:', err);
    // Mantenemos el bot funcionando
});

// Cierre limpio
const handleShutdown = () => {
    console.log('🛑 Cerrando bot...');
    client.destroy().finally(() => process.exit(0));
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

// Inicio del cliente
console.log('🚀 Iniciando bot...');
client.initialize().catch(error => {
    console.error('Error al iniciar el bot:', error);
    process.exit(1);
});