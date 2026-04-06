import { BadRequestException, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

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
  async uploadImageToS3(
    input: S3ImageUploadInput,
  ): Promise<S3ImageUploadResult> {
    const { credentials, bucketName, file, keyPrefix = 'images' } = input;

    if (
      !credentials.region ||
      !credentials.accessKey ||
      !credentials.secretKey
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
    const key = `${this.normalizePrefix(keyPrefix)}${Date.now()}-${randomUUID()}${extension}`;

    const client = new S3Client({
      region: credentials.region,
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
      }),
    );

    return {
      key,
      bucketName,
      region: credentials.region,
      etag: response.ETag,
      url: `https://${bucketName}.s3.${credentials.region}.amazonaws.com/${key}`,
    };
  }

  private normalizePrefix(prefix: string): string {
    return prefix.replace(/^\/+|\/+$/g, '') + '/';
  }

  private getFileExtension(originalname?: string, mimetype?: string): string {
    const fromOriginalName = originalname?.split('.').pop()?.trim();

    if (fromOriginalName) {
      return `.${fromOriginalName.toLowerCase()}`;
    }

    const fromMime = mimetype?.split('/')[1]?.split('+')[0]?.trim();
    if (fromMime) {
      return `.${fromMime.toLowerCase()}`;
    }

    return '.jpg';
  }
}
