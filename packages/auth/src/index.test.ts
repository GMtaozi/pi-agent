import { describe, it, expect } from 'vitest';
import {
  createJWT,
  verifyJWT,
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  encryptApiKey,
  decryptApiKey,
  generateApiKey,
} from '../src/index';

describe('auth', () => {
  describe('JWT', () => {
    it('should create a JWT token', () => {
      const payload = { sub: 'user_1', email: 'test@example.com', role: 'user', tenantId: 'default', type: 'access' as const };
      const token = createJWT(payload);

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should verify a valid JWT token', () => {
      const payload = { sub: 'user_1', email: 'test@example.com', role: 'user', tenantId: 'default', type: 'access' as const };
      const token = createJWT(payload);
      const decoded = verifyJWT(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe('user_1');
      expect(decoded?.email).toBe('test@example.com');
      expect(decoded?.type).toBe('access');
      expect(decoded?.iat).toBeDefined();
      expect(decoded?.exp).toBeDefined();
      expect(decoded?.jti).toBeDefined();
    });

    it('should return null for tampered JWT', () => {
      const payload = { sub: 'user_1', email: 'test@example.com', role: 'user', tenantId: 'default', type: 'access' as const };
      const token = createJWT(payload);
      const parts = token.split('.');
      const tampered = `${parts[0]}.${parts[1]}.invalid_signature`;

      expect(verifyJWT(tampered)).toBeNull();
    });

    it('should return null for malformed JWT', () => {
      expect(verifyJWT('not.a.jwt')).toBeNull();
      expect(verifyJWT('invalid')).toBeNull();
      expect(verifyJWT('')).toBeNull();
    });

    it('should return null for expired JWT', () => {
      const payload = { sub: 'user_1', email: 'test@example.com', role: 'user', tenantId: 'default', type: 'access' as const };
      const token = createJWT(payload, 'secret', -100); // already expired

      expect(verifyJWT(token, 'secret')).toBeNull();
    });

    it('should verify with custom secret', () => {
      const payload = { sub: 'user_1', email: 'test@example.com', role: 'user', tenantId: 'default', type: 'access' as const };
      const secret = 'my-custom-secret';
      const token = createJWT(payload, secret);

      expect(verifyJWT(token, secret)).not.toBeNull();
      expect(verifyJWT(token, 'wrong-secret')).toBeNull();
    });
  });

  describe('Access/Refresh tokens', () => {
    it('should create and verify access token', () => {
      const token = createAccessToken('user_1', 'test@example.com', 'user', 'default');
      const payload = verifyAccessToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('user_1');
      expect(payload?.type).toBe('access');
    });

    it('should create and verify refresh token', () => {
      const token = createRefreshToken('user_1', 'test@example.com', 'user', 'default');
      const payload = verifyRefreshToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('user_1');
      expect(payload?.type).toBe('refresh');
    });

    it('should not verify access token as refresh', () => {
      const accessToken = createAccessToken('user_1', 'test@example.com', 'user', 'default');
      const payload = verifyRefreshToken(accessToken);

      expect(payload).toBeNull();
    });

    it('should not verify refresh token as access', () => {
      const refreshToken = createRefreshToken('user_1', 'test@example.com', 'user', 'default');
      const payload = verifyAccessToken(refreshToken);

      expect(payload).toBeNull();
    });
  });

  describe('API Key', () => {
    it('should generate API key with prefix', () => {
      const key = generateApiKey();

      expect(key).toMatch(/^wf_/);
      expect(key.length).toBeGreaterThan(20);
    });

    it('should encrypt and decrypt API key', () => {
      const original = 'wf_test-api-key-12345';
      const encrypted = encryptApiKey(original);

      expect(encrypted).toMatch(/^enc:/);
      expect(encrypted).not.toBe(original);

      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should return original if not encrypted format', () => {
      const plain = 'wf_not-encrypted-key';
      expect(decryptApiKey(plain)).toBe(plain);
    });

    it('should return original for invalid encrypted format', () => {
      const invalid = 'enc:invalid:format';
      expect(decryptApiKey(invalid)).toBe(invalid);
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1).not.toBe(key2);
    });
  });
});
