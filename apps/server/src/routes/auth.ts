import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';

export interface AuthRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database?: any;
}

interface UserRow {
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

function generateId(): string {
  return 'usr_' + randomBytes(12).toString('hex');
}

export function registerAuthRoutes(server: FastifyInstance, deps: AuthRouteDeps): void {
  const { database } = deps;

  // POST /api/v1/auth/register
  server.post('/api/v1/auth/register', async (req, res) => {
    try {
      const { email, password, name } = req.body as { email?: string; password?: string; name?: string };

      if (!email || !password || !name) {
        return res.code(400).send({ error: 'Email, password and name are required' });
      }

      // Check if user exists
      const existing = await database.query('users', 'SELECT id FROM users WHERE email = ?', [email]);
      if (existing.rows.length > 0) {
        return res.code(409).send({ error: 'User already exists' });
      }

      // Hash password using bcrypt
      const { hashPassword, encryptApiKey, generateApiKey, createAccessToken, createRefreshToken } = await import('@workforge/auth');
      const passwordHash = await hashPassword(password);

      const userId = generateId();
      const now = new Date().toISOString();

      await database.query('users',
        'INSERT INTO users (id, email, name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, email, name, passwordHash, 'user', 'active', now, now]
      );

      const accessToken = createAccessToken(userId, email, 'user', 'default');
      const refreshToken = createRefreshToken(userId, email, 'user', 'default');

      return res.code(201).send({
        user: { id: userId, email, name, role: 'user', status: 'active', createdAt: now, updatedAt: now },
        accessToken,
        refreshToken,
        expiresIn: 3600,
      });
    } catch (error) {
      req.log.error({ error }, 'Registration failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/auth/login
  server.post('/api/v1/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        return res.code(400).send({ error: 'Email and password are required' });
      }

      const { verifyPassword, createAccessToken, createRefreshToken } = await import('@workforge/auth');

      const result = await database.query('users', 'SELECT * FROM users WHERE email = ? AND status = ?', [email, 'active']);
      if (result.rows.length === 0) {
        return res.code(401).send({ error: 'Invalid credentials' });
      }

      const user = result.rows[0] as UserRow;
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.code(401).send({ error: 'Invalid credentials' });
      }

      const accessToken = createAccessToken(user.id, user.email, user.role, 'default');
      const refreshToken = createRefreshToken(user.id, user.email, user.role, 'default');

      return res.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
        accessToken,
        refreshToken,
        expiresIn: 3600,
      });
    } catch (error) {
      req.log.error({ error }, 'Login failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/auth/refresh
  server.post('/api/v1/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      if (!refreshToken) {
        return res.code(400).send({ error: 'Refresh token is required' });
      }

      const { verifyRefreshToken, createAccessToken, createRefreshToken } = await import('@workforge/auth');
      const payload = verifyRefreshToken(refreshToken);
      if (!payload) {
        return res.code(401).send({ error: 'Invalid refresh token' });
      }

      // Rotate refresh token
      const newAccessToken = createAccessToken(payload.sub, payload.email, payload.role, payload.tenantId);
      const newRefreshToken = createRefreshToken(payload.sub, payload.email, payload.role, payload.tenantId);

      return res.send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
      });
    } catch (error) {
      req.log.error({ error }, 'Token refresh failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/auth/me
  server.get('/api/v1/auth/me', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;

      if (!token) {
        return res.code(401).send({ error: 'Authentication required' });
      }

      const { verifyAccessToken } = await import('@workforge/auth');
      const payload = verifyAccessToken(token);
      if (!payload) {
        return res.code(401).send({ error: 'Invalid token' });
      }

      const result = await database.query('users',
        'SELECT id, email, name, role, status, created_at, updated_at FROM users WHERE id = ?',
        [payload.sub]
      );

      if (result.rows.length === 0) {
        return res.code(404).send({ error: 'User not found' });
      }

      return res.send({ user: result.rows[0] });
    } catch (error) {
      req.log.error({ error }, 'Get current user failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/auth/api-key - Generate API key
  server.post('/api/v1/auth/api-key', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;

      if (!token) {
        return res.code(401).send({ error: 'Authentication required' });
      }

      const { verifyAccessToken, generateApiKey, encryptApiKey } = await import('@workforge/auth');
      const payload = verifyAccessToken(token);
      if (!payload) {
        return res.code(401).send({ error: 'Invalid token' });
      }

      const apiKey = generateApiKey();
      const encrypted = encryptApiKey(apiKey);

      await database.query('users', 'UPDATE users SET api_key_encrypted = ?, updated_at = ? WHERE id = ?',
        [encrypted, new Date().toISOString(), payload.sub]
      );

      return res.send({ apiKey });
    } catch (error) {
      req.log.error({ error }, 'API key generation failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });
}
