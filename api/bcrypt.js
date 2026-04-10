import bcrypt from 'bcryptjs'

export async function hashPassword(password) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password, hashed) {
  return bcrypt.compare(password, hashed)
}
