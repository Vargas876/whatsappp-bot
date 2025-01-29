# Dockerfile
FROM node:18-slim

# Install required dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    libgbm1 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libcups2 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libgdk-pixbuf2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install
RUN npm install -g pm2

# Copy project files
COPY . .

# Create logs directory
RUN mkdir -p logs

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Start script
CMD ["npm", "start"]