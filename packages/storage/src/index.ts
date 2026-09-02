import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';

export interface StorageConfig {
  endPoint?: string;
  port?: number;
  useSSL?: boolean;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
}

export interface UploadResult {
  key: string;
  size: number;
  etag: string;
  url: string;
}

export class StorageService {
  private client: MinioClient;
  private bucket: string;
  private config: StorageConfig;
  private logger: any;

  constructor(config: StorageConfig = {}) {
    this.config = config;
    this.bucket = config.bucket || process.env.MINIO_BUCKET || 'workforge';
    this.client = new MinioClient({
      endPoint: config.endPoint || process.env.MINIO_ENDPOINT || 'localhost',
      port: config.port || parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: config.useSSL || false,
      accessKey: config.accessKey || process.env.MINIO_ACCESS_KEY || 'workforge',
      secretKey: config.secretKey || process.env.MINIO_SECRET_KEY || 'workforge123',
      region: config.region || 'us-east-1',
    });
    this.logger = {
      info: (msg: string, data?: any) => console.log('[Storage]', msg, data || ''),
      warn: (msg: string, data?: any) => console.warn('[Storage]', msg, data || ''),
      error: (msg: string, data?: any) => console.error('[Storage]', msg, data || ''),
      debug: (msg: string, data?: any) => console.debug('[Storage]', msg, data || ''),
    };
  }

  async initialize(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket, this.config.region || 'us-east-1');
      this.logger.info('Created bucket', { bucket: this.bucket });
    }
    this.logger.info('Storage service initialized', { bucket: this.bucket });
  }

  async upload(key: string, data: Buffer | Readable, size?: number, contentType?: string): Promise<UploadResult> {
    const metaData = contentType ? { 'Content-Type': contentType } : undefined;
    const result = await this.client.putObject(this.bucket, key, data, size, metaData);
    return {
      key,
      size: size || 0,
      etag: result.etag,
      url: await this.getUrl(key),
    };
  }

  async download(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(key: string): Promise<string> {
    const protocol = this.config.useSSL ? 'https' : 'http';
    const port = this.config.port || 9000;
    return `${protocol}://${this.config.endPoint || 'localhost'}:${port}/${this.bucket}/${key}`;
  }

  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async listObjects(prefix?: string, recursive = true): Promise<string[]> {
    const objects: string[] = [];
    const stream = this.client.listObjects(this.bucket, prefix, recursive);
    return new Promise((resolve, reject) => {
      stream.on('data', (obj: any) => objects.push(obj.name));
      stream.on('end', () => resolve(objects));
      stream.on('error', reject);
    });
  }
}
