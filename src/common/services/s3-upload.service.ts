import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
}

export type S3UploadCredentials = {
  region: string;
  accessKey: string;
  secretKey: string;
};

export type S3ImageUploadInput = {
  credentials: S3UploadCredentials;
  bucketName: string;
  file: {
    buffer?: Buffer;
    mimetype?: string;
    originalname?: string;
  };
  keyPrefix?: string;
};

export type S3ImageUploadResult = {
  key: string;
  url: string;
  bucketName: string;
  region: string;
  etag?: string;
};

@Injectable()
export class S3UploadService {
  private readonly logger = new Logger(S3UploadService.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl?: string;
  private readonly endpoint?: string;
  private readonly forcePathStyle: boolean;
  private readonly s3: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.mustGet('AWS_S3_BUCKET');
    this.region =
      this.configService.get<string>('AWS_REGION') || 'ap-southeast-1';
    this.publicBaseUrl = this.configService.get<string>(
      'AWS_S3_PUBLIC_BASE_URL',
    );
    this.endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    this.forcePathStyle =
      this.configService.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true';

    this.s3 = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId: this.mustGet('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.mustGet('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    keyPrefix = 'uploads',
  ): Promise<UploadResult> {
    return this.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      keyPrefix,
    );
  }

  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    contentType: string,
    keyPrefix = 'uploads',
  ): Promise<UploadResult> {
    const normalizedName = originalName.replace(/\s+/g, '-');
    const key =
      this.normalizePrefix(keyPrefix) +
      Date.now() +
      '-' +
      randomUUID() +
      '-' +
      normalizedName;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      }),
    );

    return {
      key,
      bucket: this.bucket,
      url: this.resolvePublicUrl(key, this.bucket, this.region),
    };
  }

  async uploadBufferToKey(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<UploadResult> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key.replace(/^\/+/, ''),
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      }),
    );

    return {
      key: key.replace(/^\/+/, ''),
      bucket: this.bucket,
      url: this.resolvePublicUrl(key.replace(/^\/+/, ''), this.bucket, this.region),
    };
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresInSeconds = 60 * 10,
  ): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async uploadFilesConcurrently(
    files: Express.Multer.File[],
    keyPrefix = 'uploads',
  ): Promise<Array<UploadResult & { index: number; originalname: string }>> {
    const uploads = files.map(async (file, index) => {
      const uploaded = await this.uploadFile(file, keyPrefix);
      return {
        ...uploaded,
        index,
        originalname: file.originalname,
      };
    });

    return Promise.all(uploads);
  }

  async uploadImageToS3(
    input: S3ImageUploadInput,
  ): Promise<S3ImageUploadResult> {
    const { credentials, bucketName, file, keyPrefix = 'images' } = input;

    if (
      !credentials?.region ||
      !credentials?.accessKey ||
      !credentials?.secretKey
    ) {
      throw new BadRequestException(
        'Missing S3 credentials: region, accessKey, secretKey are required',
      );
    }

    if (!bucketName) {
      throw new BadRequestException('bucketName is required');
    }

    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Image file buffer is required');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException(
        'Only image files are allowed for S3 upload',
      );
    }

    const extension = this.getFileExtension(file.originalname, file.mimetype);
    const key =
      this.normalizePrefix(keyPrefix) +
      Date.now() +
      '-' +
      randomUUID() +
      extension;

    const client = new S3Client({
      region: credentials.region,
      endpoint: this.endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId: credentials.accessKey,
        secretAccessKey: credentials.secretKey,
      },
    });

    const response = await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    return {
      key,
      bucketName,
      region: credentials.region,
      etag: response.ETag,
      url: this.resolvePublicUrl(key, bucketName, credentials.region),
    };
  }

  private resolvePublicUrl(
    key: string,
    bucket: string,
    region: string,
  ): string {
    if (this.publicBaseUrl && bucket === this.bucket) {
      const base = this.publicBaseUrl.replace(/\/$/, '');
      return base + '/' + key;
    }

    return 'https://' + bucket + '.s3.' + region + '.amazonaws.com/' + key;
  }

  private normalizePrefix(prefix: string): string {
    return prefix.replace(/^\/+|\/+$/g, '') + '/';
  }

  private getFileExtension(originalname?: string, mimetype?: string): string {
    const fromOriginalName = originalname?.split('.').pop()?.trim();
    if (fromOriginalName) {
      return '.' + fromOriginalName.toLowerCase();
    }

    const fromMime = mimetype?.split('/')[1]?.split('+')[0]?.trim();
    if (fromMime) {
      return '.' + fromMime.toLowerCase();
    }

    return '.jpg';
  }

  private mustGet(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      this.logger.error('Missing required environment variable: ' + key);
      throw new InternalServerErrorException(
        'Server is not configured for S3 upload: ' + key,
      );
    }

    return value;
  }
}
