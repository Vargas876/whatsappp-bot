const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const express = require('express');
const { exec } = require('child_process');

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

// Función para ejecutar comandos en el sistema
const executeCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            resolve(stdout || stderr);
        });
    });
};

// Función de autenticación para Telegram
const authenticate = (msg) => {
    if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
        telegramBot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        return false;
    }
    return true;
};

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

// Inicializar WhatsApp Client
client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '/app/.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Evento QR para WhatsApp
client.on('qr', async (qr) => {
    console.log('Nuevo código QR generado');
    try {
        const qrImageBuffer = await qrcode.toBuffer(qr);
        if (telegramBot && AUTHORIZED_USER_ID) {
            await telegramBot.sendPhoto(AUTHORIZED_USER_ID, qrImageBuffer, {
                caption: '📱 Escanea este código QR en WhatsApp Web'
            });
        }
    } catch (error) {
        console.error('Error al generar/enviar QR:', error);
    }
});

client.on('ready', async () => {
    console.log('WhatsApp Bot conectado');
    if (telegramBot && AUTHORIZED_USER_ID) {
        await telegramBot.sendMessage(AUTHORIZED_USER_ID, '✅ WhatsApp Bot conectado exitosamente.');
    }
});

client.on('disconnected', async (reason) => {
    console.log('WhatsApp Bot desconectado:', reason);
    if (telegramBot && AUTHORIZED_USER_ID) {
        await telegramBot.sendMessage(AUTHORIZED_USER_ID, '⚠️ WhatsApp Bot desconectado.');
    }
    if (!isShuttingDown) {
        client.initialize();
    }
});

// Comandos de control en Telegram
telegramBot.onText(/\/status/, async (msg) => {
    if (!authenticate(msg)) return;
    try {
        const status = await executeCommand('pm2 status');
        telegramBot.sendMessage(msg.chat.id, `📊 Estado actual:\n\`\`\`\n${status}\n\`\`\``, { parse_mode: 'Markdown' });
    } catch (error) {
        telegramBot.sendMessage(msg.chat.id, `❌ Error al obtener estado: ${error.message}`);
    }
});

telegramBot.onText(/\/start_bot/, async (msg) => {
    if (!authenticate(msg)) return;
    try {
        await executeCommand('pm2 start whatsapp-bot');
        telegramBot.sendMessage(msg.chat.id, '✅ Bot de WhatsApp iniciado correctamente');
    } catch (error) {
        telegramBot.sendMessage(msg.chat.id, `❌ Error al iniciar: ${error.message}`);
    }
});

telegramBot.onText(/\/stop_bot/, async (msg) => {
    if (!authenticate(msg)) return;
    try {
        await executeCommand('pm2 stop whatsapp-bot');
        telegramBot.sendMessage(msg.chat.id, '🛑 Bot de WhatsApp detenido correctamente');
    } catch (error) {
        telegramBot.sendMessage(msg.chat.id, `❌ Error al detener: ${error.message}`);
    }
});

telegramBot.onText(/\/restart_bot/, async (msg) => {
    if (!authenticate(msg)) return;
    try {
        await executeCommand('pm2 restart whatsapp-bot');
        telegramBot.sendMessage(msg.chat.id, '🔄 Bot de WhatsApp reiniciado correctamente');
    } catch (error) {
        telegramBot.sendMessage(msg.chat.id, `❌ Error al reiniciar: ${error.message}`);
    }
});

telegramBot.onText(/\/logs/, async (msg) => {
    if (!authenticate(msg)) return;
    try {
        const logs = await executeCommand('pm2 logs whatsapp-bot --lines 20');
        telegramBot.sendMessage(msg.chat.id, `📜 Últimos logs:\n\`\`\`\n${logs}\n\`\`\``, { parse_mode: 'Markdown' });
    } catch (error) {
        telegramBot.sendMessage(msg.chat.id, `❌ Error al obtener logs: ${error.message}`);
    }
});

telegramBot.onText(/\/help/, (msg) => {
    if (!authenticate(msg)) return;
    const helpText = `
🤖 *Comandos disponibles:*

/status - Ver estado del bot
/start_bot - Iniciar el bot de WhatsApp
/stop_bot - Detener el bot de WhatsApp
/restart_bot - Reiniciar el bot de WhatsApp
/logs - Ver últimos logs
/help - Mostrar esta ayuda
    `;
    telegramBot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
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

// Función de limpieza
async function cleanup() {
    console.log('Iniciando limpieza...');
    isShuttingDown = true;
    if (client) {
        try { await client.destroy(); } catch (err) { console.error('Error al cerrar WhatsApp:', err); }
    }
    if (telegramBot) {
        try { telegramBot.stopPolling(); } catch (err) { console.error('Error al detener Telegram:', err); }
    }
}

// Manejo de señales y errores
process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });
process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
process.on('uncaughtException', async (err) => { console.error('Error no capturado:', err); await cleanup(); process.exit(1); });
process.on('unhandledRejection', async (err) => { console.error('Promesa rechazada no manejada:', err); await cleanup(); process.exit(1); });

// Inicialización de WhatsApp
console.log('Iniciando bot...');
client.initialize().catch(err => {
    console.error('Error al inicializar WhatsApp:', err);
    process.exit(1);
});
