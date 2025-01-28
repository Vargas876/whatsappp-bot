module.exports = {
    apps: [{
        name: "whatsapp-bot",
        script: "./bot.js",
        watch: false, // Cambiar a false para evitar reinicios innecesarios
        max_memory_restart: "1G",
        exp_backoff_restart_delay: 5000,
        env: {
            NODE_ENV: "production",
        },
        autorestart: true,
        max_restarts: 10,
        error_file: "logs/err.log",
        out_file: "logs/out.log",
        // Agregar estas opciones
        restart_delay: 5000,
        kill_timeout: 3000,
        wait_ready: true,
        listen_timeout: 30000
    }]
};