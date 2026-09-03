import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

// Encrypts secrets (e.g. custom model API keys) at rest in the database using
// AES-256-GCM. The key is derived from DB_ENCRYPTION_KEY.
const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:';

function getKey(): Buffer {
  const secret = process.env.DB_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('FATAL: DB_ENCRYPTION_KEY environment variable is required');
  }
  // S5 Fix: 使用 scrypt 派生密钥
  const salt = Buffer.from('workforge-db-encryption-salt-v1', 'utf8');
  return scryptSync(secret, salt, 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptSecret(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value;
  const [, ivHex, tagHex, dataHex] = value.split(':');
  if (!ivHex || !tagHex || !dataHex) return value;
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
