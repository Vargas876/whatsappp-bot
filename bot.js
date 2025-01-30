const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode-terminal');
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

// Función de limpieza
async function cleanup() {
    console.log('Iniciando limpieza...');
    isShuttingDown = true;

    if (client) {
        try {
            await client.destroy();
            console.log('Cliente WhatsApp cerrado');
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

// Inicializar Telegram Bot
try {
    telegramBot = new TelegramBot(TELEGRAM_TOKEN, {
        polling: true,
        filepath: false
    });
    console.log('Bot de Telegram iniciado');
} catch (err) {
    console.error('Error al iniciar Telegram:', err);
}

// Crear instancia de WhatsApp
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

// Eventos de WhatsApp
client.on('qr', (qr) => {
    console.log('Nuevo código QR generado');
    console.log('='.repeat(50));
    console.log('Escanea este código QR en WhatsApp:');
    qrcode.generate(qr, { small: true });

    // Enviar notificación a Telegram
    if (telegramBot && AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(
            AUTHORIZED_USER_ID,
            '📱 Nuevo código QR generado. Por favor, revisa los logs para escanearlo.'
        ).catch(console.error);
    }
});

client.on('ready', async () => {
    console.log('WhatsApp Bot conectado exitosamente');
    if (telegramBot && AUTHORIZED_USER_ID) {
        await telegramBot.sendMessage(
            AUTHORIZED_USER_ID,
            '✅ WhatsApp Bot conectado exitosamente!\n📱 Ya puedes usar el bot en WhatsApp.'
        ).catch(console.error);
    }
});

client.on('disconnected', async (reason) => {
    console.log('WhatsApp Bot desconectado:', reason);
    if (telegramBot && AUTHORIZED_USER_ID) {
        await telegramBot.sendMessage(
            AUTHORIZED_USER_ID,
            '⚠️ WhatsApp Bot desconectado. Se generará un nuevo código QR para reconectar.'
        ).catch(console.error);
    }
    if (!isShuttingDown) {
        client.initialize();
    }
});

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

// Inicialización de WhatsApp
console.log('Iniciando bot...');
client.initialize().catch(err => {
    console.error('Error al inicializar WhatsApp:', err);
    process.exit(1);
});