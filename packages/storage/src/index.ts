import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { pipeline } from 'stream';

const pipelineAsync = promisify(pipeline);

export interface StorageConfig {
  endPoint?: string;
  port?: number;
  useSSL?: boolean;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
  localStorageDir?: string;
  forceLocal?: boolean;
}

export interface UploadResult {
  key: string;
  size: number;
  etag: string;
  url: string;
}

export class StorageService {
  private client: MinioClient | null = null;
  private bucket: string;
  private config: StorageConfig;
  private logger: any;
  private localStorageDir: string;
  private backend: 'minio' | 'local' = 'local';

  constructor(config: StorageConfig = {}) {
    this.config = config;
    this.bucket = config.bucket || process.env.MINIO_BUCKET || 'workforge';
    this.localStorageDir = config.localStorageDir || process.env.LOCAL_STORAGE_DIR || './data/storage';
    
    // If forceLocal is set or MinIO env vars are not configured, use local storage
    const hasMinioConfig = config.endPoint || process.env.MINIO_ENDPOINT;
    const shouldUseLocal = config.forceLocal || !hasMinioConfig;
    
    if (shouldUseLocal) {
      this.backend = 'local';
      this.ensureLocalDir();
    } else {
      this.backend = 'minio';
      this.client = new MinioClient({
        endPoint: config.endPoint || process.env.MINIO_ENDPOINT || 'localhost',
        port: config.port || parseInt(process.env.MINIO_PORT || '9000'),
        useSSL: config.useSSL || false,
        accessKey: config.accessKey || process.env.MINIO_ACCESS_KEY || 'workforge',
        secretKey: config.secretKey || process.env.MINIO_SECRET_KEY || 'workforge123',
        region: config.region || 'us-east-1',
      });
    }
    
    this.logger = {
      info: (msg: string, data?: any) => console.log('[Storage]', msg, data || ''),
      warn: (msg: string, data?: any) => console.warn('[Storage]', msg, data || ''),
      error: (msg: string, data?: any) => console.error('[Storage]', msg, data || ''),
      debug: (msg: string, data?: any) => console.debug('[Storage]', msg, data || ''),
    };
  }

  private ensureLocalDir(): void {
    if (!fs.existsSync(this.localStorageDir)) {
      fs.mkdirSync(this.localStorageDir, { recursive: true });
    }
  }

  private getLocalPath(key: string): string {
    // Sanitize key to prevent directory traversal
    const safeKey = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.localStorageDir, safeKey);
  }

  async initialize(): Promise<void> {
    if (this.backend === 'local') {
      this.ensureLocalDir();
      this.logger.info('Storage service initialized (local filesystem backend)', { dir: this.localStorageDir });
      return;
    }

    // MinIO backend with automatic fallback
    try {
      const exists = await this.client!.bucketExists(this.bucket);
      if (!exists) {
        await this.client!.makeBucket(this.bucket, this.config.region || 'us-east-1');
        this.logger.info('Created bucket', { bucket: this.bucket });
      }
      this.logger.info('Storage service initialized (MinIO backend)', { bucket: this.bucket });
    } catch (minioError) {
      this.logger.warn('MinIO unavailable, falling back to local filesystem storage', { error: minioError });
      this.backend = 'local';
      this.ensureLocalDir();
      this.logger.info('Storage service initialized (local filesystem backend - fallback)', { dir: this.localStorageDir });
    }
  }

  async upload(key: string, data: Buffer | Readable, size?: number, contentType?: string): Promise<UploadResult> {
    if (this.backend === 'local') {
      return this.uploadLocal(key, data, size, contentType);
    }
    try {
      const metaData = contentType ? { 'Content-Type': contentType } : undefined;
      const result = await this.client!.putObject(this.bucket, key, data, size, metaData);
      return {
        key,
        size: size || 0,
        etag: result.etag,
        url: await this.getUrl(key),
      };
    } catch (error) {
      this.logger.warn('MinIO upload failed, falling back to local', { key, error });
      return this.uploadLocal(key, data, size, contentType);
    }
  }

  private async uploadLocal(key: string, data: Buffer | Readable, size?: number, contentType?: string): Promise<UploadResult> {
    const filePath = this.getLocalPath(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else {
      const writeStream = fs.createWriteStream(filePath);
      await pipelineAsync(data as any, writeStream);
    }

    const stats = fs.statSync(filePath);
    const etag = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 32);

    return {
      key,
      size: stats.size,
      etag,
      url: `file://${filePath}`,
    };
  }

  async download(key: string): Promise<Buffer> {
    if (this.backend === 'local') {
      return this.downloadLocal(key);
    }
    try {
      const stream = await this.client!.getObject(this.bucket, key);
      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.warn('MinIO download failed, trying local fallback', { key, error });
      return this.downloadLocal(key);
    }
  }

  private downloadLocal(key: string): Buffer {
    const filePath = this.getLocalPath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    return fs.readFileSync(filePath);
  }

  async delete(key: string): Promise<void> {
    if (this.backend === 'local') {
      return this.deleteLocal(key);
    }
    try {
      await this.client!.removeObject(this.bucket, key);
    } catch (error) {
      this.logger.warn('MinIO delete failed, trying local', { key, error });
      await this.deleteLocal(key);
    }
  }

  private deleteLocal(key: string): void {
    const filePath = this.getLocalPath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.backend === 'local') {
      return this.existsLocal(key);
    }
    try {
      await this.client!.statObject(this.bucket, key);
      return true;
    } catch {
      return this.existsLocal(key);
    }
  }

  private existsLocal(key: string): boolean {
    const filePath = this.getLocalPath(key);
    return fs.existsSync(filePath);
  }

  async getUrl(key: string): Promise<string> {
    if (this.backend === 'local') {
      const filePath = this.getLocalPath(key);
      return `file://${filePath}`;
    }
    const protocol = this.config.useSSL ? 'https' : 'http';
    const port = this.config.port || 9000;
    return `${protocol}://${this.config.endPoint || 'localhost'}:${port}/${this.bucket}/${key}`;
  }

  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    if (this.backend === 'local') {
      // For local storage, return file URL
      return this.getUrl(key);
    }
    return this.client!.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async listObjects(prefix?: string, recursive = true): Promise<string[]> {
    if (this.backend === 'local') {
      return this.listObjectsLocal(prefix, recursive);
    }
    try {
      const objects: string[] = [];
      const stream = this.client!.listObjects(this.bucket, prefix, recursive);
      return new Promise((resolve, reject) => {
        stream.on('data', (obj: any) => objects.push(obj.name));
        stream.on('end', () => resolve(objects));
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.warn('MinIO list failed, trying local', { error });
      return this.listObjectsLocal(prefix, recursive);
    }
  }

  private listObjectsLocal(prefix?: string, recursive = true): string[] {
    const results: string[] = [];
    const searchDir = prefix 
      ? path.join(this.localStorageDir, prefix)
      : this.localStorageDir;
    
    if (!fs.existsSync(searchDir)) return results;

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.localStorageDir, fullPath);
        if (entry.isDirectory() && recursive) {
          walk(fullPath);
        } else if (entry.isFile()) {
          results.push(relativePath);
        }
      }
    };

    walk(searchDir);
    return results;
  }
}
