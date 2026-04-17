import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const postUploadsDir = path.resolve(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, postUploadsDir);
    },
    filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        callback(null, `${uuidv4()}${extension}`);
    }
});

function imageFileFilter(_req, file, callback) {
    if (!file.mimetype?.startsWith('image/')) {
        callback(new Error('Only image files are allowed'));
        return;
    }
    callback(null, true);
}

const uploader = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 8 * 1024 * 1024
    }
});

function handleSingleImageUpload(fieldName) {
    return (req, res, next) => {
        uploader.single(fieldName)(req, res, (error) => {
            if (!error) {
                next();
                return;
            }

            if (error.code === 'LIMIT_FILE_SIZE') {
                res.status(400).json({ detail: 'Image must not exceed 8MB' });
                return;
            }

            if (error.message === 'Only image files are allowed') {
                res.status(400).json({ detail: error.message });
                return;
            }

            next(error);
        });
    };
}

export const uploadPostImage = handleSingleImageUpload('image');
export const uploadAvatarImage = handleSingleImageUpload('avatar');

export async function deleteUploadedFile(filePath) {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch {
        // Ignore cleanup failures.
    }
}

export async function deleteUploadedImageUrl(imageUrl) {
    if (!imageUrl) return;

    try {
        const filename = extractStoredUploadName(imageUrl);
        if (!filename) return;
        await deleteUploadedFile(path.join(postUploadsDir, filename));
    } catch {
        // Ignore cleanup failures.
    }
}

export function buildPublicUploadUrl(req, filename) {
    return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

export function extractStoredUploadName(value) {
    if (!value || typeof value !== 'string') return '';

    try {
        const url = new URL(value);
        return path.basename(url.pathname);
    } catch {
        return path.basename(value);
    }
}

export function resolvePublicUploadUrl(req, value) {
    if (!value) return '';
    if (typeof value !== 'string') return '';
    if (/^https?:\/\//i.test(value)) return value;
    return buildPublicUploadUrl(req, extractStoredUploadName(value));
}
