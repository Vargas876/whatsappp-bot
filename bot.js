const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Configuración de rutas y estados
const QR_PATH = path.join(__dirname, 'qr-code.png');
let isClientReady = false;
let isBotActive = true;

// Set de números objetivo para búsqueda O(1)
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

// Configuraciones principales
const ADMIN_NUMBER = '573228932335@c.us';
const COOLDOWN_TIME = 35 * 60 * 1000;
const FAST_RESPONSE = 'V.';

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

// Función para notificaciones al administrador
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

// Configuración del cliente para Android
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: 'auth_data'
    }),
    puppeteer: {
        headless: true,
        executablePath: '/data/data/com.termux/files/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-websql',
            '--disable-web-security',
            '--disable-site-isolation-trials',
            '--no-experiments',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    }
});

// Manejador de mensajes principal
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

            // Verificar si el mensaje citado ya existe en el caché
            const originalMessageId = quotedMsg.id._serialized;
            const respondedNumbers = responseCache.respondedMessages.get(originalMessageId) || new Set();

            // Verificar respuestas previas
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

            // Actualizar caché de respuestas
            respondedNumbers.add(actualSender);
            responseCache.respondedMessages.set(originalMessageId, respondedNumbers);

            // Lógica de bloqueo por primer respondedor
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

        // Respuesta rápida para primer mensaje
        if (!responseCache.initialResponses.has(actualSender)) {
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

// Generación del código QR
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
});

process.on('unhandledRejection', (err) => {
    console.error('Promesa rechazada no manejada:', err);
});

// Manejo de cierre limpio
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