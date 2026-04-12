import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

interface UploadResult {
  key: string;
  url: string;
  bucket: string;
}

@Injectable()
export class S3UploadService {
  private readonly logger = new Logger(S3UploadService.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl?: string;
  private readonly s3: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.mustGet('AWS_S3_BUCKET');
    this.region =
      this.configService.get<string>('AWS_REGION') || 'ap-southeast-1';
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    const forcePathStyle =
      this.configService.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true';

    this.s3 = new S3Client({
      region: this.region,
      endpoint,
      forcePathStyle,
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
    const normalizedName = file.originalname.replace(/\s+/g, '-');
    const key = `${keyPrefix}/${Date.now()}-${randomUUID()}-${normalizedName}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    return {
      key,
      bucket: this.bucket,
      url: this.resolvePublicUrl(key),
    };
  }

  private resolvePublicUrl(key: string): string {
    if (this.publicBaseUrl) {
      const base = this.publicBaseUrl.replace(/\/$/, '');
      return `${base}/${key}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private mustGet(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      this.logger.error(`Missing required environment variable: ${key}`);
      throw new InternalServerErrorException(
        `Server is not configured for S3 upload: ${key}`,
      );
    }

    return value;
  }
}
