import { sql } from '../../db.js';

// Lấy người dùng theo tên hoặc email.
export async function selectUserByUsernameOrEmail(username) {
    const { rows } =
        await sql`SELECT * FROM users WHERE username = ${username} OR email = ${username}`;
    return rows[0] || null;
}

// Lấy người dùng theo id.
export async function selectUserById(userId) {
    const { rows } = await sql`SELECT * FROM users WHERE id = ${userId}`;
    return rows[0] || null;
}

// Thêm người dùng mới.
export async function insertUser({
    username,
    email,
    hashedPassword,
    dateOfBirth
}) {
    const { rows } = await sql`
      INSERT INTO users (username, email, hashed_password, date_of_birth)
      VALUES (${username}, ${email}, ${hashedPassword}, ${dateOfBirth || null})
      RETURNING id, username, email, date_of_birth, is_admin, created_at`;
    return rows[0] || null;
}

// Lưu refresh token.
export async function insertRefreshToken({ userId, tokenHash, expiresAt }) {
    await sql`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (${userId}, ${tokenHash}, ${expiresAt})`;
}
