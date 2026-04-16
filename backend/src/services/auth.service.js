import bcrypt from 'bcryptjs';
import {
    created,
    err,
    ok,
    rateLimitResponse,
    signToken,
    verifyToken
} from '../controllers/shared.controller.js';
import {
    insertRefreshToken,
    insertUser,
    selectUserById,
    selectUserByUsernameOrEmail
} from '../repositories/auth.repository.js';

const loginLimits = new Map();

// Kiểm tra giới hạn đăng nhập theo IP.
function checkLoginLimit(ip) {
    const now = Date.now();
    const record = loginLimits.get(ip) || {
        count: 0,
        resetAt: now + 15 * 60 * 1000
    };
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + 15 * 60 * 1000;
    }
    record.count++;
    loginLimits.set(ip, record);
    if (record.count > 10) {
        return {
            limited: true,
            retryAfter: Math.ceil((record.resetAt - now) / 1000)
        };
    }
    return { limited: false };
}

// Xử lý đăng ký tài khoản.
export async function POST_auth_register(req, res) {
    const body = req.body;
    const { username, email, password, date_of_birth } = body;

    if (!username || !email || !password) {
        return err(res, 400, 'username, email, and password are required');
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
        return err(
            res,
            400,
            'Username must be 4–20 characters: letters, numbers, and underscore only'
        );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return err(res, 400, 'Invalid email format');
    }
    if (password.length < 8) {
        return err(res, 400, 'Password must be at least 8 characters');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await insertUser({
            username,
            email,
            hashedPassword,
            dateOfBirth: date_of_birth
        });
        return created(res, user);
    } catch (error) {
        if (error.code === '23505') {
            const field = error.constraint?.includes('username')
                ? 'Username'
                : 'Email';
            return err(res, 400, `${field} already registered`);
        }
        return err(res, 500, 'Registration failed');
    }
}

// Xử lý đăng nhập.
export async function POST_auth_login(req, res) {
    const ip =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        'unknown';

    const limited = checkLoginLimit(ip);
    if (limited.limited) return rateLimitResponse(res, limited.retryAfter);

    const body = req.body;
    const { username, password } = body;

    const user = await selectUserByUsernameOrEmail(username);
    if (!user) return err(res, 401, 'Incorrect username or password');

    const valid = await bcrypt.compare(password, user.hashed_password);
    if (!valid) return err(res, 401, 'Incorrect username or password');

    const access_token = signToken(user.id, 'access');
    const refresh_token = signToken(user.id, 'refresh');

    const tokenHash = await bcrypt.hash(refresh_token, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await insertRefreshToken({
        userId: user.id,
        tokenHash,
        expiresAt
    });

    return ok(res, {
        access_token,
        refresh_token,
        token_type: 'bearer',
        expires_in: 900
    });
}

// Làm mới access token.
export async function POST_auth_refresh(req, res) {
    const body = req.body;
    const { refresh_token } = body;
    if (!refresh_token) return err(res, 400, 'refresh_token is required');

    try {
        const payload = verifyToken(refresh_token);
        if (!payload || payload.type !== 'refresh') {
            return err(res, 401, 'Invalid refresh token');
        }
        const userId = payload.sub;

        const user = await selectUserById(userId);
        if (!user) return err(res, 401, 'User not found');

        const newAccessToken = signToken(userId, 'access');
        const newRefreshToken = signToken(userId, 'refresh');

        const tokenHash = await bcrypt.hash(newRefreshToken, 10);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await insertRefreshToken({
            userId,
            tokenHash,
            expiresAt
        });

        return ok(res, {
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_type: 'bearer',
            expires_in: 900
        });
    } catch {
        return err(res, 401, 'Invalid or expired refresh token');
    }
}
