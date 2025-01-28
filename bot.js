const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Verificación del ambiente Termux
const isTermux = process.env.TERMUX_VERSION !== undefined;
const chromiumPath = '/data/data/com.termux/files/usr/bin/chromium';

// Verificar si Chromium está instalado
const checkChromium = () => {
    if (!fs.existsSync(chromiumPath)) {
        console.error('⚠️ Chromium no está instalado. Por favor ejecuta: pkg install chromium');
        process.exit(1);
    }
};

if (isTermux) {
    checkChromium();
}

const QR_PATH = path.join(__dirname, 'qr-code.png');
let isClientReady = false;

// Configuración específica para Termux
const clientConfig = {
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: isTermux ? chromiumPath : undefined,
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
            '--disable-gpu',
            '--disable-extensions',
            '--disable-default-apps',
            '--enable-features=NetworkService',
            '--no-default-browser-check',
            '--no-first-run',
            '--disable-notifications',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-networking',
            '--no-zygote',
            '--single-process'
        ]
    }
};

const client = new Client(clientConfig);

// Resto de tu código original del bot...

// Manejo mejorado de errores
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

client.on('ready', () => {
    isClientReady = true;
    console.log('🤖 Bot listo y funcionando!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Error de autenticación:', msg);
    console.log('🔄 Reiniciando bot en 5 segundos...');
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

client.on('disconnected', (reason) => {
    console.log('📴 Bot desconectado:', reason);
    console.log('🔄 Intentando reconectar...');
    client.initialize();
});

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
    console.error('Error no capturado:', err);
    // No cerramos el proceso para mantener el bot funcionando
});

process.on('unhandledRejection', (err) => {
    console.error('Promesa rechazada no manejada:', err);
    // No cerramos el proceso para mantener el bot funcionando
});

// Script de inicio
const startBot = async () => {
    try {
        console.log('🚀 Iniciando bot...');
        await client.initialize();
    } catch (error) {
        console.error('Error al iniciar el bot:', error);
        console.log('🔄 Reintentando en 5 segundos...');
        setTimeout(startBot, 5000);
    }
};

startBot();