import jwt from 'jsonwebtoken'

const SECRET = process.env.SECRET_KEY || 'fallback-secret-key'
const ALGORITHM = process.env.ALGORITHM || 'HS256'

export function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { algorithm: ALGORITHM, expiresIn: '30m' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET, { algorithms: [ALGORITHM] })
  } catch {
    return null
  }
}
