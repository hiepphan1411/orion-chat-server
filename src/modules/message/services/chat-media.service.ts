import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageType } from 'src/common/enums/message-type.enum';

type MediaMetadata = {
  mediaUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  messageType: MessageType;
  fileExtension: string;
  fileCategory: 'image' | 'video' | 'audio' | 'file';
  fileIcon: string;
};

@Injectable()
export class ChatMediaService {
  private readonly maxFileSize = 20 * 1024 * 1024;
  private readonly maxFilesPerMessage = 5;
  private readonly maxTotalFilesSize = 50 * 1024 * 1024;

  private readonly allowedMimePrefixes = [
    'image/',
    'video/',
    'audio/',
    'application/',
    'text/',
  ];

  getLimits() {
    return {
      maxFileSize: this.maxFileSize,
      maxFilesPerMessage: this.maxFilesPerMessage,
      maxTotalFilesSize: this.maxTotalFilesSize,
    };
  }

  validateUploadBatch(files: Express.Multer.File[]): void {
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    if (files.length > this.maxFilesPerMessage) {
      throw new BadRequestException(
        `Maximum ${this.maxFilesPerMessage} files are allowed per message`,
      );
    }

    let total = 0;
    for (const file of files) {
      this.validateUpload(file);
      total += file.size;
    }

    if (total > this.maxTotalFilesSize) {
      throw new BadRequestException(
        `Total upload size exceeds ${Math.floor(this.maxTotalFilesSize / (1024 * 1024))}MB`,
      );
    }
  }

  validateUpload(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (!file.mimetype) {
      throw new BadRequestException('file mimetype is required');
    }

    if (file.size <= 0) {
      throw new BadRequestException('file size must be greater than 0');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException('File size exceeds 20MB limit');
    }

    const validMime = this.allowedMimePrefixes.some((prefix) =>
      file.mimetype.startsWith(prefix),
    );

    if (!validMime) {
      throw new BadRequestException('Unsupported file type');
    }
  }

  toMessageType(mimeType?: string): MessageType {
    const normalizedMime = String(mimeType || '').toLowerCase();

    if (normalizedMime.startsWith('image/')) return MessageType.IMAGE;
    if (normalizedMime.startsWith('video/')) return MessageType.VIDEO;
    if (normalizedMime.startsWith('audio/')) return MessageType.AUDIO;

    return MessageType.FILE;
  }

  resolveMessageType(mimeType?: string, preferredType?: string): MessageType {
    const normalizedPreferred = String(preferredType || '').toUpperCase();

    if (
      normalizedPreferred === MessageType.IMAGE ||
      normalizedPreferred === MessageType.VIDEO ||
      normalizedPreferred === MessageType.AUDIO ||
      normalizedPreferred === MessageType.FILE
    ) {
      return normalizedPreferred as MessageType;
    }

    return this.toMessageType(mimeType);
  }

  getFileExtension(fileName: string, mimeType?: string): string {
    const extensionFromName = fileName.split('.').pop();
    if (extensionFromName && extensionFromName !== fileName) {
      return extensionFromName.toLowerCase();
    }

    const extensionFromMime = String(mimeType || '').split('/')[1];
    return String(extensionFromMime || 'bin')
      .split('+')[0]
      .toLowerCase();
  }

  getFileCategory(
    messageType: MessageType,
  ): 'image' | 'video' | 'audio' | 'file' {
    if (messageType === MessageType.IMAGE) return 'image';
    if (messageType === MessageType.VIDEO) return 'video';
    if (messageType === MessageType.AUDIO) return 'audio';
    return 'file';
  }

  getFileIcon(extension: string, messageType: MessageType): string {
    if (messageType === MessageType.IMAGE) return 'image';
    if (messageType === MessageType.VIDEO) return 'video';
    if (messageType === MessageType.AUDIO) return 'audio';

    const ext = extension.toLowerCase();
    if (ext === 'pdf') return 'file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'file-word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'file-powerpoint';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'file-archive';
    if (['txt', 'md'].includes(ext)) return 'file-text';

    return 'file';
  }

  buildMediaMetadata(payload: {
    mediaUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    preferredMessageType?: string;
  }): MediaMetadata {
    const messageType = this.resolveMessageType(
      payload.mimeType,
      payload.preferredMessageType,
    );
    const fileExtension = this.getFileExtension(
      payload.fileName,
      payload.mimeType,
    );
    const fileCategory = this.getFileCategory(messageType);
    const fileIcon = this.getFileIcon(fileExtension, messageType);

    return {
      mediaUrl: payload.mediaUrl,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      mimeType: payload.mimeType,
      messageType,
      fileExtension,
      fileCategory,
      fileIcon,
    };
  }
}
