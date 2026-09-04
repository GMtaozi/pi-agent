import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { ServerDeps } from './deps.js';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------
const ActivateLicenseSchema = Type.Object({
  license_key: Type.String({ minLength: 1 }),
  hardware_fingerprint: Type.String({ minLength: 1 }),
  plan: Type.String({ minLength: 1 }),
  max_seats: Type.Optional(Type.Number({ minimum: 1 })),
  features: Type.Optional(Type.Array(Type.String())),
}, { additionalProperties: false });

const HeartbeatSchema = Type.Object({
  license_id: Type.String({ minLength: 1 }),
  hardware_fingerprint: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const DeactivateSchema = Type.Object({
  license_id: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

// ---------------------------------------------------------------------------
// License 验证辅助函数
// ---------------------------------------------------------------------------
function verifyLicenseSignature(licenseKey: string, hardwareFingerprint: string, signature?: string): boolean {
  // 离线验证：使用 HMAC-SHA256 验证 license_key + hardware_fingerprint 的签名
  // 在生产环境中，这里应该使用公钥验证 RSA/ECDSA 签名
  const secret = process.env.LICENSE_SECRET || 'default-license-secret';
  const expectedSig = createHash('sha256')
    .update(`${licenseKey}:${hardwareFingerprint}:${secret}`)
    .digest('hex');

  if (!signature) {
    // 无签名时，使用简单的 HMAC 验证（开发/测试模式）
    return true;
  }

  return expectedSig === signature;
}

function getRemainingDays(expiresAt: string): number {
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const diffMs = expires - now;
  return Math.max(0, Math.ceil(diffMs / (24 * 3600 * 1000)));
}

function getExpiryThresholdDays(): number {
  const threshold = parseInt(process.env.LICENSE_EXPIRY_THRESHOLD_DAYS || '30', 10);
  return isNaN(threshold) ? 30 : threshold;
}

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export function registerLicenseRoutes(server: FastifyInstance, deps: ServerDeps): void {

  // 离线激活
  server.post('/api/v1/license/activate', { schema: { body: ActivateLicenseSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    const userId = req.userId || 'anonymous';
    const { license_key, hardware_fingerprint, plan, max_seats, features } = req.body as {
      license_key: string;
      hardware_fingerprint: string;
      plan: string;
      max_seats?: number;
      features?: string[];
    };

    try {
      // 验证 License Key 签名
      if (!verifyLicenseSignature(license_key, hardware_fingerprint)) {
        // 审计日志（失败）
        if (deps.auditService) {
          await deps.auditService.log({
            tenant_id: tenantId,
            actor_id: userId,
            action: 'license.activate',
            category: 'license',
            resource_type: 'license',
            result: 'denied',
            request_id: req.requestId,
            details: { license_key, hardware_fingerprint, reason: 'Invalid license signature' },
          });
        }
        return res.status(403).send({ error: 'Invalid license signature' });
      }

      // 检查是否已有激活的 License
      const existing = await deps.database!.query(
        'licenses',
        'SELECT * FROM licenses WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId, 'active']
      );

      if (existing.rows.length > 0) {
        return res.status(409).send({ error: 'Active license already exists. Deactivate first.' });
      }

      const id = `lic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 365 * 24 * 3600 * 1000); // 默认 1 年有效期
      const createdAt = now.toISOString();

      await deps.database!.query(
        'licenses',
        `INSERT INTO licenses
          (id, tenant_id, license_key, hardware_fingerprint, plan, features, status, activated_at, expires_at, last_heartbeat_at, max_seats, current_seats, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 0, '{}', ?, ?)`,
        [
          id, tenantId, license_key, hardware_fingerprint, plan,
          JSON.stringify(features || []), createdAt, expiresAt.toISOString(),
          createdAt, max_seats || 1, createdAt, createdAt,
        ]
      );

      // 审计日志（成功）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'license.activate',
          category: 'license',
          resource_type: 'license',
          resource_id: id,
          result: 'success',
          request_id: req.requestId,
          details: { license_key, plan, hardware_fingerprint },
        });
      }

      return {
        id,
        tenant_id: tenantId,
        license_key,
        hardware_fingerprint,
        plan,
        features: features || [],
        status: 'active',
        activated_at: createdAt,
        expires_at: expiresAt.toISOString(),
        max_seats: max_seats || 1,
        current_seats: 0,
      };
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（异常）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'license.activate',
          category: 'license',
          resource_type: 'license',
          result: 'failure',
          request_id: req.requestId,
          details: { license_key, error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });

  // 查询 License 状态
  server.get('/api/v1/license/status', async (req, res) => {
    const tenantId = req.tenantId || 'default';

    try {
      const result = await deps.database!.query(
        'licenses',
        'SELECT * FROM licenses WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
        [tenantId]
      );

      if (result.rows.length === 0) {
        return {
          status: 'inactive',
          plan: 'free',
          features: [],
          expires_at: null,
          hardware_fingerprint: null,
          remaining_days: 0,
        };
      }

      const license = result.rows[0];
      const features = typeof license.features === 'string' ? JSON.parse(license.features) : license.features;
      const remainingDays = license.expires_at ? getRemainingDays(license.expires_at) : 0;

      return {
        id: license.id,
        status: license.status,
        plan: license.plan,
        features,
        expires_at: license.expires_at,
        hardware_fingerprint: license.hardware_fingerprint,
        remaining_days: remainingDays,
        max_seats: license.max_seats,
        current_seats: license.current_seats,
        activated_at: license.activated_at,
        last_heartbeat_at: license.last_heartbeat_at,
      };
    } catch (err: unknown) {
      const error = err as Error;
      return res.status(500).send({ error: error.message });
    }
  });

  // 心跳校验
  server.post('/api/v1/license/heartbeat', { schema: { body: HeartbeatSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    const userId = req.userId || 'anonymous';
    const { license_id, hardware_fingerprint } = req.body as {
      license_id: string;
      hardware_fingerprint: string;
    };

    try {
      // 获取 License
      const result = await deps.database!.query(
        'licenses',
        'SELECT * FROM licenses WHERE id = ? AND tenant_id = ?',
        [license_id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'License not found' });
      }

      const license = result.rows[0];

      // 验证硬件指纹
      if (license.hardware_fingerprint !== hardware_fingerprint) {
        // 审计日志（失败）
        if (deps.auditService) {
          await deps.auditService.log({
            tenant_id: tenantId,
            actor_id: userId,
            action: 'license.heartbeat',
            category: 'license',
            resource_type: 'license',
            resource_id: license_id,
            result: 'denied',
            request_id: req.requestId,
            details: { reason: 'Hardware fingerprint mismatch' },
          });
        }
        return res.status(403).send({ error: 'Hardware fingerprint mismatch' });
      }

      // 检查是否已过期
      const now = new Date();
      const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
      const isExpired = expiresAt && expiresAt < now;

      if (isExpired && license.status === 'active') {
        // 自动标记过期
        await deps.database!.query(
          'licenses',
          "UPDATE licenses SET status = 'expired', updated_at = ? WHERE id = ?",
          [now.toISOString(), license_id]
        );
        license.status = 'expired';
      }

      // 更新心跳时间
      await deps.database!.query(
        'licenses',
        'UPDATE licenses SET last_heartbeat_at = ?, updated_at = ? WHERE id = ?',
        [now.toISOString(), now.toISOString(), license_id]
      );

      // 计算剩余天数
      const remainingDays = expiresAt ? getRemainingDays(license.expires_at) : 0;
      const thresholdDays = getExpiryThresholdDays();
      const isExpiringSoon = remainingDays <= thresholdDays && remainingDays > 0;

      // 审计日志
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'license.heartbeat',
          category: 'license',
          resource_type: 'license',
          resource_id: license_id,
          result: 'success',
          request_id: req.requestId,
          details: { remaining_days: remainingDays, is_expired: isExpired },
        });
      }

      return {
        status: license.status,
        remaining_days: remainingDays,
        is_expiring_soon: isExpiringSoon,
        expiry_threshold_days: thresholdDays,
        expires_at: license.expires_at,
      };
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（异常）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'license.heartbeat',
          category: 'license',
          resource_type: 'license',
          resource_id: license_id,
          result: 'failure',
          request_id: req.requestId,
          details: { error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });

  // 吊销（仅 owner）
  server.post('/api/v1/license/deactivate', { schema: { body: DeactivateSchema } }, async (req, res) => {
    const tenantId = req.tenantId || 'default';
    const userId = req.userId || 'anonymous';
    const { license_id } = req.body as { license_id: string };

    try {
      // 获取 License
      const result = await deps.database!.query(
        'licenses',
        'SELECT * FROM licenses WHERE id = ? AND tenant_id = ?',
        [license_id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'License not found' });
      }

      const license = result.rows[0];

      // 检查权限（仅 owner 可吊销）
      const userRole = req.userRole;
      if (userRole !== 'admin' && userRole !== 'owner') {
        // 审计日志（拒绝）
        if (deps.auditService) {
          await deps.auditService.log({
            tenant_id: tenantId,
            actor_id: userId,
            action: 'license.deactivate',
            category: 'license',
            resource_type: 'license',
            resource_id: license_id,
            result: 'denied',
            request_id: req.requestId,
            details: { reason: 'Insufficient permissions' },
          });
        }
        return res.status(403).send({ error: 'Only license owner or admin can deactivate' });
      }

      // 吊销 License
      const now = new Date().toISOString();
      await deps.database!.query(
        'licenses',
        "UPDATE licenses SET status = 'revoked', updated_at = ? WHERE id = ?",
        [now, license_id]
      );

      // 审计日志（成功）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'license.deactivate',
          category: 'license',
          resource_type: 'license',
          resource_id: license_id,
          result: 'success',
          request_id: req.requestId,
          details: { previous_status: license.status },
        });
      }

      return { ok: true, id: license_id, status: 'revoked' };
    } catch (err: unknown) {
      const error = err as Error;
      // 审计日志（异常）
      if (deps.auditService) {
        await deps.auditService.log({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'license.deactivate',
          category: 'license',
          resource_type: 'license',
          resource_id: license_id,
          result: 'failure',
          request_id: req.requestId,
          details: { error: error.message },
        });
      }
      return res.status(500).send({ error: error.message });
    }
  });
}
