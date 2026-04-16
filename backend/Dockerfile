FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production --no-audit --no-fund || npm install --production --no-audit --no-fund

# Copy app source
COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "index.js"]
