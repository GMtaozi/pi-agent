import bcrypt from 'bcryptjs';
import { randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual, scryptSync } from 'crypto';

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  api_key_encrypted?: string;
  role: 'user' | 'admin';
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  type: 'access' | 'refresh';
}

export interface AuthResult {
  user: Omit<User, 'password_hash' | 'api_key_encrypted'>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// S1 Fix: 缺失即报错，不使用回退默认值
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const API_KEY_ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY;

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}
if (!REFRESH_SECRET) {
  throw new Error('FATAL: REFRESH_SECRET environment variable is required');
}
if (!API_KEY_ENCRYPTION_KEY) {
  throw new Error('FATAL: API_KEY_ENCRYPTION_KEY environment variable is required');
}

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

// S5 Fix: 使用 scrypt 派生加密密钥，而非零填充
function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32);
}

// Base64URL encode/decode helpers
function base64UrlEncode(data: Buffer | string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

// JWT implementation using HMAC-SHA256
export function createJWT(payload: AuthTokenPayload, secret: string = JWT_SECRET, expiresIn: number = ACCESS_TOKEN_EXPIRY): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: randomBytes(16).toString('hex'),
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyJWT(token: string, secret: string = JWT_SECRET): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;
    const expectedSig = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');

    const sigBuf = base64UrlDecode(signature);
    const expectedBuf = base64UrlDecode(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// API Key encryption (AES-256-GCM with scrypt key derivation)
export function encryptApiKey(apiKey: string): string {
  const salt = randomBytes(16);
  const key = deriveKey(API_KEY_ENCRYPTION_KEY, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ['enc', salt.toString('hex'), iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptApiKey(encrypted: string): string {
  if (!encrypted || !encrypted.startsWith('enc:')) return encrypted;
  const parts = encrypted.split(':');
  if (parts.length !== 5) return encrypted;

  const [saltHex, ivHex, tagHex, dataHex] = parts.slice(1);
  const salt = Buffer.from(saltHex, 'hex');
  const key = deriveKey(API_KEY_ENCRYPTION_KEY, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// Token generation helpers
export function createAccessToken(userId: string, email: string, role: string, tenantId: string): string {
  const payload: AuthTokenPayload = { sub: userId, email, role, tenantId, type: 'access' };
  return createJWT(payload, JWT_SECRET, ACCESS_TOKEN_EXPIRY);
}

export function createRefreshToken(userId: string, email: string, role: string, tenantId: string): string {
  const payload: AuthTokenPayload = { sub: userId, email, role, tenantId, type: 'refresh' };
  return createJWT(payload, REFRESH_SECRET, REFRESH_TOKEN_EXPIRY);
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  const payload = verifyJWT(token, JWT_SECRET);
  return payload && payload.type === 'access' ? payload : null;
}

export function verifyRefreshToken(token: string): AuthTokenPayload | null {
  const payload = verifyJWT(token, REFRESH_SECRET);
  return payload && payload.type === 'refresh' ? payload : null;
}

// Generate API key for a user
export function generateApiKey(): string {
  return `wf_${randomBytes(24).toString('hex')}`;
}

export { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY };
