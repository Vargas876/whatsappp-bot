const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const path = require('path');

// Replace with your Telegram bot token from BotFather
const TELEGRAM_TOKEN = '7831188456:AAGWbs2PUSC1E7tSuzBvR_OyoF7f8DKhS8Q';
// Replace with your Telegram user ID (for security)
const AUTHORIZED_USER_ID = '5573246970';

// Create the bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Command execution wrapper
const executeCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            resolve(stdout || stderr);
        });
    });
};

// Authentication middleware
const authenticate = (msg, action) => {
    if (msg.from.id.toString() !== AUTHORIZED_USER_ID) {
        bot.sendMessage(msg.chat.id, '❌ No estás autorizado para usar este bot.');
        return false;
    }
    return true;
};

// Status command
bot.onText(/\/status/, async (msg) => {
    if (!authenticate(msg)) return;

    try {
        const status = await executeCommand('pm2 status');
        bot.sendMessage(msg.chat.id, `📊 Estado actual:\n\`\`\`\n${status}\n\`\`\``, {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Error al obtener estado: ${error.message}`);
    }
});

// Start command
bot.onText(/\/start_bot/, async (msg) => {
    if (!authenticate(msg)) return;

    try {
        await executeCommand('pm2 start whatsapp-bot');
        bot.sendMessage(msg.chat.id, '✅ Bot de WhatsApp iniciado correctamente');
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Error al iniciar: ${error.message}`);
    }
});

// Stop command
bot.onText(/\/stop_bot/, async (msg) => {
    if (!authenticate(msg)) return;

    try {
        await executeCommand('pm2 stop whatsapp-bot');
        bot.sendMessage(msg.chat.id, '🛑 Bot de WhatsApp detenido correctamente');
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Error al detener: ${error.message}`);
    }
});

// Restart command
bot.onText(/\/restart_bot/, async (msg) => {
    if (!authenticate(msg)) return;

    try {
        await executeCommand('pm2 restart whatsapp-bot');
        bot.sendMessage(msg.chat.id, '🔄 Bot de WhatsApp reiniciado correctamente');
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Error al reiniciar: ${error.message}`);
    }
});

// Logs command
bot.onText(/\/logs/, async (msg) => {
    if (!authenticate(msg)) return;

    try {
        const logs = await executeCommand('pm2 logs whatsapp-bot --lines 20');
        bot.sendMessage(msg.chat.id, `📜 Últimos logs:\n\`\`\`\n${logs}\n\`\`\``, {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        bot.sendMessage(msg.chat.id, `❌ Error al obtener logs: ${error.message}`);
    }
});

// Help command
bot.onText(/\/help/, (msg) => {
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

    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

// Error handler
bot.on('error', (error) => {
    console.error('Error en el bot de Telegram:', error);
});

console.log('🚀 Bot de control iniciado correctamente');