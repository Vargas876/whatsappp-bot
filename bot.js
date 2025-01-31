const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const express = require('express');

// Configuración de Express
const app = express();
const port = process.env.PORT || 8080;

// Configuración de Telegram
const TELEGRAM_TOKEN = '7831188456:AAGWbs2PUSC1E7tSuzBvR_OyoF7f8DKhS8Q';
const AUTHORIZED_USER_ID = '5573246970';

// Nuevas configuraciones para manejo de mensajes
const ADMIN_NUMBER = '573228932335@c.us';
const COOLDOWN_TIME = 35 * 60 * 1000;

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

// Variables para gestionar el estado
let isShuttingDown = false;
let telegramBot = null;
let client = null;
let isClientReady = false;
let botStatus = {
    whatsappConnected: false,
    lastQRGenerated: null,
    startTime: null,
    totalMessages: 0
};

// Caché en memoria para respuestas rápidas
const responseCache = {
    isBlocked: false,
    lastRespondedNumber: null,
    blockUntil: null,
    pendingResponses: new Set(),
    initialResponses: new Set(),
    respondedMessages: new Map()
};

// Respuesta rápida precompilada
const FAST_RESPONSE = 'V.';

// Notificación asíncrona sin esperar respuesta
async function sendNotificationToAdmin(message, isGroup, type = 'response') {
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

        // Enviar notificación por Telegram
        if (telegramBot && AUTHORIZED_USER_ID) {
            telegramBot.sendMessage(AUTHORIZED_USER_ID, notificationText).catch(console.error);
        }
    } catch (error) {
        console.error('Error getting contact/group info:', error);
    }
}

// Verificación de bloqueo optimizada
function isSystemBlocked() {
    return responseCache.isBlocked && Date.now() < responseCache.blockUntil;
}

// Función para inicializar WhatsApp
async function initializeWhatsApp() {
    // Destruir cliente existente si está activo
    if (client) {
        try {
            await client.destroy();
        } catch (destroyErr) {
            console.error('Error al destruir cliente anterior:', destroyErr);
        }
    }

    // Crear nuevo cliente
    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: '/app/.wwebjs_auth'
        }),
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
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        }
    });

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
                    await sendNotificationToAdmin(message, isGroup, 'blocked');
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
                        await sendNotificationToAdmin(message, isGroup, 'blocked');
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

            // Incrementar contador de mensajes
            botStatus.totalMessages++;
        } catch (error) {
            console.error('Error en manejo de mensajes:', error);
        }
    });

    // Eventos existentes de WhatsApp
    client.on('qr', async (qr) => {
        console.log('Nuevo código QR generado');
        botStatus.lastQRGenerated = new Date();

        try {
            // Generar imagen QR
            const qrImageBuffer = await qrcode.toBuffer(qr, {
                type: 'png',
                margin: 4,
                width: 512,
                errorCorrectionLevel: 'H'
            });

            // Enviar QR por Telegram si está configurado
            if (telegramBot && AUTHORIZED_USER_ID) {
                await telegramBot.sendPhoto(
                    AUTHORIZED_USER_ID,
                    qrImageBuffer,
                    { caption: '📱 Nuevo código QR generado. Por favor, escanea.' }
                );
            }
        } catch (qrError) {
            console.error('Error al generar QR:', qrError);
        }
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp cliente está READY');
        botStatus.whatsappConnected = true;
        isClientReady = true;

        // Notificar por Telegram cuando esté listo
        if (telegramBot && AUTHORIZED_USER_ID) {
            telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                '✅ WhatsApp Bot conectado y listo para usar!'
            ).catch(console.error);

            // Enviar mensaje al número de admin
            setTimeout(() => {
                client.sendMessage(ADMIN_NUMBER, '🤖 Bot Activo').catch(() => {});
            }, 0);
        }
    });

    // Otros eventos existentes...
    client.on('authenticated', (session) => {
        console.log('👍 Autenticación completada');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Fallo de autenticación:', msg);
        botStatus.whatsappConnected = false;
        isClientReady = false;

        // Notificar por Telegram
        if (telegramBot && AUTHORIZED_USER_ID) {
            telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                `❌ Fallo de autenticación: ${msg}`
            ).catch(console.error);
        }
    });

    client.on('disconnected', (reason) => {
        console.log('🔌 WhatsApp desconectado:', reason);
        botStatus.whatsappConnected = false;
        isClientReady = false;

        // Notificar por Telegram
        if (telegramBot && AUTHORIZED_USER_ID) {
            telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                `🔌 WhatsApp desconectado: ${reason}`
            ).catch(console.error);
        }

        // Intentar reconectar
        setTimeout(() => client.initialize(), 0);
    });

    try {
        // Inicializar cliente
        await client.initialize();
        console.log('🚀 Cliente WhatsApp inicializado');
        botStatus.startTime = new Date();
    } catch (initError) {
        console.error('❌ Error al inicializar cliente:', initError);

        // Notificar por Telegram
        if (telegramBot && AUTHORIZED_USER_ID) {
            telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                `❌ Error al inicializar WhatsApp: ${initError.message}`
            ).catch(console.error);
        }
    }
}


// Inicializar Telegram Bot con comandos
try {
    telegramBot = new TelegramBot(TELEGRAM_TOKEN, {
        polling: true,
        filepath: false
    });

    // Comando /start - Inicia o reinicia el bot de WhatsApp
    telegramBot.onText(/\/start/, async (msg) => {
        if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
            return telegramBot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        }

        await telegramBot.sendMessage(msg.chat.id, '🔄 Iniciando WhatsApp Bot...');
        try {
            await initializeWhatsApp();
            await telegramBot.sendMessage(msg.chat.id, '✅ Bot iniciado correctamente. Esperando código QR...');
        } catch (error) {
            console.error('Error al iniciar WhatsApp:', error);
            await telegramBot.sendMessage(msg.chat.id, '❌ Error al iniciar el bot: ' + error.message);
        }
    });

    // Comando /stop - Detiene el bot de WhatsApp
    telegramBot.onText(/\/stop/, async (msg) => {
        if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
            return telegramBot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        }

        await telegramBot.sendMessage(msg.chat.id, '🛑 Deteniendo WhatsApp Bot...');
        try {
            await cleanup();
            await telegramBot.sendMessage(msg.chat.id, '✅ Bot detenido correctamente');
        } catch (error) {
            console.error('Error al detener WhatsApp:', error);
            await telegramBot.sendMessage(msg.chat.id, '❌ Error al detener el bot: ' + error.message);
        }
    });

    // Comando /status - Muestra el estado actual del bot
    telegramBot.onText(/\/status/, async (msg) => {
        if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
            return telegramBot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        }

        const uptime = botStatus.startTime ? Math.floor((new Date() - botStatus.startTime) / 1000) : 0;
        const status = `📊 Estado del Bot:
        
🔌 Conexión WhatsApp: ${botStatus.whatsappConnected ? '✅ Conectado' : '❌ Desconectado'}
⏱️ Tiempo activo: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s
📨 Mensajes procesados: ${botStatus.totalMessages}
🕐 Último QR generado: ${botStatus.lastQRGenerated ? botStatus.lastQRGenerated.toLocaleString() : 'N/A'}`;

        await telegramBot.sendMessage(msg.chat.id, status);
    });

    // Comando /help - Muestra la lista de comandos disponibles
    telegramBot.onText(/\/help/, async (msg) => {
        if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
            return telegramBot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        }

        const helpText = `📝 Comandos disponibles:

/start - Inicia o reinicia el bot de WhatsApp
/stop - Detiene el bot de WhatsApp
/status - Muestra el estado actual del bot
/help - Muestra esta lista de comandos`;

        await telegramBot.sendMessage(msg.chat.id, helpText);
    });

    console.log('Bot de Telegram iniciado');
} catch (err) {
    console.error('Error al iniciar Telegram:', err);
}

// Configuración de Express
app.get('/', (req, res) => {
    res.send('Bot is running');
});
// Función de limpieza
async function cleanup() {
    isShuttingDown = true;
    try {
        if (client) {
            await client.destroy();
        }
        if (telegramBot) {
            await telegramBot.stopPolling();
        }
        if (server) {
            server.close();
        }
    } catch (error) {
        console.error('Error durante la limpieza:', error);
    }
}
// Iniciar servidor
const server = app.listen(port, () => {
    console.log(`Servidor escuchando en puerto ${port}`);
}).on('error', (err) => {
    console.error('Error al iniciar servidor:', err);
    process.exit(1);
});

// Manejo de señales y errores
process.on('SIGTERM', async () => {
    console.log('Recibida señal SIGTERM');
    await cleanup();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Recibida señal SIGINT');
    await cleanup();
    process.exit(0);
});

process.on('uncaughtException', async (err) => {
    console.error('Error no capturado:', err);
    await cleanup();
    process.exit(1);
});

process.on('unhandledRejection', async (err) => {
    console.error('Promesa rechazada no manejada:', err);
    await cleanup();
    process.exit(1);
});


// Modificar la inicialización inicial
console.log('🤖 Iniciando bot...');
initializeWhatsApp().catch(err => {
    console.error('❌ Error crítico al inicializar:', err);
    process.exit(1);
});