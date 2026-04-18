import { BadRequestException } from '@nestjs/common';
import { MessageType } from 'src/common/enums/message-type.enum';
import { ChatMediaService } from './chat-media.service';

describe('ChatMediaService', () => {
  let service: ChatMediaService;

  beforeEach(() => {
    service = new ChatMediaService();
  });

  it('should detect image message type from mime', () => {
    expect(service.toMessageType('image/png')).toBe(MessageType.IMAGE);
  });

  it('should detect file message type for application mime', () => {
    expect(service.toMessageType('application/pdf')).toBe(MessageType.FILE);
  });

  it('should throw when file exceeds size limit', () => {
    const oversized = {
      mimetype: 'image/png',
      size: 21 * 1024 * 1024,
    } as Express.Multer.File;

    expect(() => service.validateUpload(oversized)).toThrow(
      BadRequestException,
    );
  });

  it('should build upload metadata payload', () => {
    const metadata = service.buildMediaMetadata({
      mediaUrl: 'https://cdn.example.com/a.jpg',
      fileName: 'a.jpg',
      fileSize: 2048,
      mimeType: 'image/jpeg',
    });

    expect(metadata).toEqual({
      mediaUrl: 'https://cdn.example.com/a.jpg',
      fileName: 'a.jpg',
      fileSize: 2048,
      mimeType: 'image/jpeg',
      messageType: MessageType.IMAGE,
      fileExtension: 'jpg',
      fileCategory: 'image',
      fileIcon: 'image',
    });
  });

  it('should enforce max file count in batch', () => {
    const files = new Array(6).fill(null).map((_, index) => ({
      originalname: `f-${index}.txt`,
      mimetype: 'text/plain',
      size: 1024,
    })) as Express.Multer.File[];

    expect(() => service.validateUploadBatch(files)).toThrow(
      BadRequestException,
    );
  });
});
