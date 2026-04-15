import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import apiRouter from './src/routes/api.routes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(apiRouter);

// Error handler
app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ detail: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

async function start() {
    await initDb();
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});