import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import apiRouter from './src/routes/api.routes.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');

mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use(apiRouter);

// Error handler
app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ detail: 'Internal server error' });
});

const BASE_PORT = Number(process.env.PORT || 3001);

function listen(port) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => resolve(server));
        server.once('error', reject);
    });
}

async function start() {
    await initDb();

    for (let port = BASE_PORT; port < BASE_PORT + 10; port += 1) {
        try {
            await listen(port);
            console.log(`Server running on port ${port}`);
            return;
        } catch (error) {
            if (error?.code === 'EADDRINUSE') {
                console.warn(
                    `Port ${port} is already in use, trying ${port + 1}...`
                );
                continue;
            }

            console.error('Server startup error:', error);
            process.exit(1);
        }
    }

    console.error(
        `No free port found in range ${BASE_PORT}-${BASE_PORT + 9}. Stop the running process or set PORT.`
    );
    process.exit(1);
}

start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
