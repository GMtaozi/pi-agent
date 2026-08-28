import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// Encrypts secrets (e.g. custom model API keys) at rest in the database using
// AES-256-GCM. The key is derived from DB_ENCRYPTION_KEY; if unset a loud
// warning is emitted and an insecure default is used (development only).
const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:';
let warned = false;

function getKey(): Buffer {
  const secret = process.env.DB_ENCRYPTION_KEY;
  if (!secret) {
    if (!warned) {
      console.warn('[security] DB_ENCRYPTION_KEY not set; using insecure default key. Set it in production.');
      warned = true;
    }
    return Buffer.from('dev-insecure-db-key-change-me-xxxx'.slice(0, 32));
  }
  return Buffer.from(secret.padEnd(32, '0').slice(0, 32));
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
