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

// Función de limpieza
async function cleanup() {
    console.log('Iniciando limpieza...');
    isShuttingDown = true;

    if (client) {
        try {
            await client.destroy();
            console.log('Cliente WhatsApp cerrado');
            botStatus.whatsappConnected = false;
        } catch (err) {
            console.error('Error al cerrar WhatsApp:', err);
        }
    }

    if (telegramBot) {
        try {
            telegramBot.stopPolling();
            console.log('Bot de Telegram detenido');
        } catch (err) {
            console.error('Error al detener Telegram:', err);
        }
    }
}

// Función para inicializar WhatsApp
async function initializeWhatsApp() {
    if (client) {
        await client.destroy();
    }

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
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--no-default-browser-check',
                '--disable-webgl',
                '--disable-threaded-animation',
                '--disable-threaded-scrolling',
                '--disable-in-process-stack-traces',
                '--disable-histogram-customizer',
                '--disable-gl-extensions',
                '--disable-composited-antialiasing',
                '--disable-canvas-aa',
                '--disable-3d-apis',
                '--disable-accelerated-2d-canvas',
                '--disable-accelerated-jpeg-decoding',
                '--disable-accelerated-mjpeg-decode',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-demo-mode',
                '--disable-gpu-early-init',
                '--disable-gpu-memory-buffer-compositor-resources',
                '--disable-gpu-process-crash-limit'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
        }
    });

    // Configurar eventos de WhatsApp
    setupWhatsAppEvents();

    // Inicializar cliente
    await client.initialize();
    botStatus.startTime = new Date();
    console.log('WhatsApp Bot iniciado');
}

// Configurar eventos de WhatsApp
function setupWhatsAppEvents() {
    client.on('qr', async (qr) => {
        console.log('Nuevo código QR generado');
        botStatus.lastQRGenerated = new Date();

        try {
            const qrImageBuffer = await qrcode.toBuffer(qr, {
                type: 'png',
                margin: 4,
                width: 512,
                errorCorrectionLevel: 'H',
                quality: 1,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            if (telegramBot && AUTHORIZED_USER_ID) {
                await telegramBot.sendPhoto(
                    AUTHORIZED_USER_ID,
                    qrImageBuffer,
                    {
                        caption: '📱 Escanea este código QR en WhatsApp Web\n' +
                            '1. Abre WhatsApp en tu teléfono\n' +
                            '2. Toca Menú ⚙️ o Ajustes y selecciona "Dispositivos Vinculados"\n' +
                            '3. Toca "Vincular un dispositivo"\n' +
                            '4. Apunta tu cámara hacia este código QR'
                    }
                );
            }

            console.log('QR Code generado exitosamente');
            console.log('='.repeat(50));

        } catch (error) {
            console.error('Error al generar/enviar QR:', error);
            if (telegramBot && AUTHORIZED_USER_ID) {
                await telegramBot.sendMessage(
                    AUTHORIZED_USER_ID,
                    '❌ Error al generar el código QR. Se intentará generar uno nuevo automáticamente.'
                );
            }
        }
    });

    client.on('ready', async () => {
        botStatus.whatsappConnected = true;
        console.log('WhatsApp Bot conectado exitosamente');
        if (telegramBot && AUTHORIZED_USER_ID) {
            await telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                '✅ WhatsApp Bot conectado exitosamente!\n📱 Ya puedes usar el bot en WhatsApp.'
            ).catch(console.error);
        }
    });

    client.on('message', async (message) => {
        botStatus.totalMessages++;
        // Aquí puedes añadir la lógica para procesar mensajes
    });

    client.on('disconnected', async (reason) => {
        botStatus.whatsappConnected = false;
        console.log('WhatsApp Bot desconectado:', reason);
        if (telegramBot && AUTHORIZED_USER_ID) {
            await telegramBot.sendMessage(
                AUTHORIZED_USER_ID,
                '⚠️ WhatsApp Bot desconectado. Usa /start para reiniciar el bot.'
            ).catch(console.error);
        }
    });
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

// Inicialización inicial de WhatsApp
console.log('Iniciando bot...');
initializeWhatsApp().catch(err => {
    console.error('Error al inicializar WhatsApp:', err);
    process.exit(1);
});