const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Configuración de Express
const app = express();
const port = process.env.PORT || 10000;

// Variables para gestionar el estado
let isShuttingDown = false;
let telegramBot = null;
let client = null;

// Función de limpieza
async function cleanup() {
    console.log('Iniciando limpieza...');
    isShuttingDown = true;

    // Cerrar WhatsApp
    if (client) {
        try {
            await client.destroy();
            console.log('Cliente WhatsApp cerrado');
        } catch (err) {
            console.error('Error al cerrar WhatsApp:', err);
        }
    }

    // Detener Telegram
    if (telegramBot) {
        try {
            telegramBot.stopPolling();
            console.log('Bot de Telegram detenido');
        } catch (err) {
            console.error('Error al detener Telegram:', err);
        }
    }
}

// Configuración de Express
app.get('/', (req, res) => {
    res.send('Bot is running');
});

// Iniciar servidor con manejo de errores
const server = app.listen(port, () => {
    console.log(`Servidor escuchando en puerto ${port}`);
}).on('error', (err) => {
    console.error('Error al iniciar servidor:', err);
    process.exit(1);
});

// Configuración de Telegram con manejo de errores
const TELEGRAM_TOKEN = '7831188456:AAGWbs2PUSC1E7tSuzBvR_OyoF7f8DKhS8Q';
const AUTHORIZED_USER_ID = '5573246970';

try {
    telegramBot = new TelegramBot(TELEGRAM_TOKEN, {
        polling: true,
        filepath: false // Deshabilitar almacenamiento de archivos
    });
    console.log('Bot de Telegram iniciado');
} catch (err) {
    console.error('Error al iniciar Telegram:', err);
}

// Configuración de WhatsApp con opciones optimizadas
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

// Manejo de señales de terminación
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

// Manejo de errores no capturados
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