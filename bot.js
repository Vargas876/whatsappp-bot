const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const express = require('express');

// Configuración de Telegram
const TELEGRAM_TOKEN = '7831188456:AAGWbs2PUSC1E7tSuzBvR_OyoF7f8DKhS8Q';
const AUTHORIZED_USER_ID = '5573246970';

// Variables para gestionar el estado
let isShuttingDown = false;
let telegramBot = null;
let client = null;
let botStatus = {
    whatsappConnected: false,
    lastQRGenerated: null,
    startTime: null,
    totalMessages: 0
};

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
                '--disable-gpu'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        }
    });

    // Configurar eventos de escucha
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

        // Notificar por Telegram cuando esté listo
        if (telegramBot && AUTHORIZED_USER_ID) {
            telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                '✅ WhatsApp Bot conectado y listo para usar!'
            ).catch(console.error);
        }
    });

    client.on('authenticated', (session) => {
        console.log('👍 Autenticación completada');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Fallo de autenticación:', msg);
        botStatus.whatsappConnected = false;

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

        // Notificar por Telegram
        if (telegramBot && AUTHORIZED_USER_ID) {
            telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                `🔌 WhatsApp desconectado: ${reason}`
            ).catch(console.error);
        }
    });

    client.on('message', (msg) => {
        botStatus.totalMessages++;
        console.log('📨 Mensaje recibido');
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