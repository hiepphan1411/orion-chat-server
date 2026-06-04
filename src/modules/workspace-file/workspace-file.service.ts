import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { extname } from 'path';
import { createHmac } from 'crypto';
import axios from 'axios';
import { S3UploadService } from 'src/common/services/s3-upload.service';
import { WorkspaceFile } from './entities/workspace-file.entity';
import { WorkspaceFileVersion } from './entities/workspace-file-version.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { CreateWorkspaceFileDto } from './dto/create-workspace-file.dto';
import { UpdateWorkspaceFileDto } from './dto/update-workspace-file.dto';

type StoredWorkspaceFile = {
  name: string;
  mimeType: string;
  size: number;
  url: string;
  s3Key: string;
};

type OnlyOfficeCallbackBody = {
  status?: number;
  url?: string;
  users?: string[];
};

@Injectable()
export class WorkspaceFileService {
  private readonly logger = new Logger(WorkspaceFileService.name);

  constructor(
    @InjectRepository(WorkspaceFile)
    private fileRepo: Repository<WorkspaceFile>,
    @InjectRepository(WorkspaceFileVersion)
    private fileVersionRepo: Repository<WorkspaceFileVersion>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly s3UploadService: S3UploadService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateWorkspaceFileDto,
    userId: string,
    uploadedFile?: Express.Multer.File,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!uploadedFile && !dto.name?.trim()) {
      throw new BadRequestException('File name is required');
    }

    let parent: WorkspaceFile | null = null;
    if (dto.parentId) {
      parent = await this.fileRepo.findOne({
        where: { fileId: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
    }

    const storedFile = await this.resolveStoredFile(workspaceId, dto, uploadedFile);

    const file = this.fileRepo.create({
      name: storedFile?.name ?? dto.name!,
      type: dto.type || 'file',
      mimeType: storedFile?.mimeType ?? dto.mimeType,
      size: storedFile?.size ?? dto.size,
      url: storedFile?.url ?? dto.url,
      s3Key: storedFile?.s3Key,
      currentVersion: storedFile?.s3Key ? 1 : 0,
      accessLevel: dto.accessLevel || 'workspace',
      workspace,
      uploadedBy: user,
      parent,
    });

    const savedFile = await this.fileRepo.save(file);
    if (storedFile?.s3Key) {
      await this.createFileVersion(savedFile, 1, storedFile, user);
    }

    return savedFile;
  }

  private async resolveStoredFile(
    workspaceId: string,
    dto: CreateWorkspaceFileDto,
    file?: Express.Multer.File,
  ): Promise<StoredWorkspaceFile | null> {
    if (file) {
      return this.storeWorkspaceUpload(workspaceId, file);
    }

    if (dto.url) {
      return null;
    }

    if (!dto.name) {
      throw new BadRequestException('File name is required');
    }

    return this.storeBlankWorkspaceFile(workspaceId, dto.name, dto.fileFormat);
  }

  private async storeWorkspaceUpload(workspaceId: string, file: Express.Multer.File) {
    const safeOriginalName = this.sanitizeFileName(file.originalname);
    const uploaded = await this.s3UploadService.uploadBuffer(
      file.buffer,
      safeOriginalName,
      file.mimetype || 'application/octet-stream',
      `workspaces/${workspaceId}/files`,
    );

    return {
      name: safeOriginalName,
      mimeType: file.mimetype,
      size: file.size,
      url: uploaded.url,
      s3Key: uploaded.key,
    };
  }

  private async storeBlankWorkspaceFile(
    workspaceId: string,
    rawName: string,
    requestedFormat?: string,
  ) {
    const format = this.resolveFileFormat(rawName, requestedFormat);
    const name = this.ensureExtension(this.sanitizeFileName(rawName), format);
    const blankFile = this.createBlankFile(name, format);
    const uploaded = await this.s3UploadService.uploadBuffer(
      blankFile.buffer,
      name,
      blankFile.mimeType,
      `workspaces/${workspaceId}/files`,
    );

    return {
      name,
      mimeType: blankFile.mimeType,
      size: blankFile.buffer.length,
      url: uploaded.url,
      s3Key: uploaded.key,
    };
  }

  private sanitizeFileName(name: string) {
    return (
      name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled'
    );
  }

  private resolveFileFormat(name: string, requestedFormat?: string) {
    const normalized = requestedFormat?.toLowerCase();
    if (normalized === 'doc' || normalized === 'docx' || normalized === 'xlsx') {
      return normalized;
    }

    const extension = extname(name).replace('.', '').toLowerCase();
    if (extension === 'doc' || extension === 'docx' || extension === 'xlsx') {
      return extension;
    }

    return 'docx';
  }

  private ensureExtension(name: string, format: string) {
    const extension = extname(name).replace('.', '').toLowerCase();
    if (extension === format) return name;
    if (extension === 'doc' || extension === 'docx' || extension === 'xlsx') {
      return name.slice(0, -extension.length - 1) + '.' + format;
    }
    return `${name}.${format}`;
  }

  private createBlankFile(name: string, format: string) {
    if (format === 'doc') {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body><h1>${name}</h1><p></p></body></html>`;
      return {
        buffer: Buffer.from(html, 'utf8'),
        mimeType: 'application/msword',
      };
    }

    if (format === 'xlsx') {
      return {
        buffer: this.createZip([
          {
            path: '[Content_Types].xml',
            content:
              '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
          },
          {
            path: '_rels/.rels',
            content:
              '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
          },
          {
            path: 'xl/workbook.xml',
            content:
              '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
          },
          {
            path: 'xl/_rels/workbook.xml.rels',
            content:
              '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
          },
          {
            path: 'xl/worksheets/sheet1.xml',
            content:
              '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
          },
        ]),
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    return {
      buffer: this.createZip([
        {
          path: '[Content_Types].xml',
          content:
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        },
        {
          path: '_rels/.rels',
          content:
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        },
        {
          path: 'word/document.xml',
          content:
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t></w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
        },
      ]),
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  private createZip(entries: Array<{ path: string; content: string }>) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
      const name = Buffer.from(entry.path, 'utf8');
      const content = Buffer.from(entry.content, 'utf8');
      const crc = this.crc32(content);

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(0, 8);
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(content.length, 18);
      localHeader.writeUInt32LE(content.length, 22);
      localHeader.writeUInt16LE(name.length, 26);
      localHeader.writeUInt16LE(0, 28);
      localParts.push(localHeader, name, content);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(0, 10);
      centralHeader.writeUInt16LE(0, 12);
      centralHeader.writeUInt16LE(0, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(content.length, 20);
      centralHeader.writeUInt32LE(content.length, 24);
      centralHeader.writeUInt16LE(name.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);
      centralParts.push(centralHeader, name);

      offset += localHeader.length + name.length + content.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirectory, end]);
  }

  private crc32(buffer: Buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private async createFileVersion(
    file: WorkspaceFile,
    version: number,
    storedFile: StoredWorkspaceFile,
    editedBy: User | null,
  ) {
    const fileVersion = this.fileVersionRepo.create({
      file,
      version,
      s3Key: storedFile.s3Key,
      url: storedFile.url,
      mimeType: storedFile.mimeType,
      size: storedFile.size,
      editedBy,
    });

    return this.fileVersionRepo.save(fileVersion);
  }

  async getOnlyOfficeConfig(fileId: string, userId: string) {
    const file = await this.fileRepo.findOne({
      where: { fileId },
      relations: ['workspace', 'uploadedBy'],
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.type === 'folder') {
      throw new BadRequestException('Folders cannot be opened in editor');
    }

    const fileType = this.getOfficeFileType(file.name, file.mimeType);
    if (!fileType) {
      throw new BadRequestException('This file type is not supported for editing');
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    const documentUrl = file.s3Key
      ? await this.s3UploadService.getPresignedDownloadUrl(file.s3Key)
      : file.url;
    if (!documentUrl) {
      throw new BadRequestException('File URL is missing');
    }

    const documentServerUrl = this.resolveDocumentServerUrl();
    const callbackUrl =
      this.resolveAppBaseUrl() +
      `/workspace-files/${file.fileId}/onlyoffice/callback?token=${this.signOnlyOfficeCallbackToken(file.fileId)}`;

    this.logger.log(
      `[ONLYOFFICE config] file=${file.fileId} title="${file.name}" callbackUrl=${callbackUrl}`,
    );

    return {
      documentServerUrl,
      config: {
        document: {
          fileType,
          key: `${file.fileId}-${file.currentVersion || 1}`,
          title: file.name,
          url: documentUrl,
          permissions: {
            edit: true,
            download: true,
            print: true,
          },
        },
        documentType: fileType === 'xlsx' ? 'cell' : 'word',
        editorConfig: {
          callbackUrl,
          lang: 'vi',
          mode: 'edit',
          user: {
            id: user.userId,
            name: user.fullName || user.phoneNumber,
          },
        },
        height: '100%',
        width: '100%',
      },
    };
  }

  async handleOnlyOfficeCallback(
    fileId: string,
    token: string | undefined,
    body: OnlyOfficeCallbackBody,
  ) {
    this.logger.log(
      `[ONLYOFFICE callback] file=${fileId} status=${body.status} hasUrl=${Boolean(body.url)} users=${body.users?.join(',') || '-'}`,
    );

    // if (!this.verifyOnlyOfficeCallbackToken(fileId, token)) {
    //   this.logger.warn(`[ONLYOFFICE callback] invalid token for file=${fileId}`);
    //   throw new BadRequestException('Invalid ONLYOFFICE callback token');
    // }

    if (body.status !== 2 && body.status !== 6) {
      return { error: 0 };
    }

    if (!body.url) {
      this.logger.warn(`[ONLYOFFICE callback] missing document URL for file=${fileId}`);
      throw new BadRequestException('ONLYOFFICE callback URL is missing');
    }

    const file = await this.fileRepo.findOne({
      where: { fileId },
      relations: ['workspace'],
    });
    if (!file) throw new NotFoundException('File not found');

    let response;
    try {
      this.logger.log(
        `[ONLYOFFICE callback] downloading edited file for file=${fileId} from ${body.url}`,
      );
      response = await axios.get<ArrayBuffer>(body.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
    } catch (error) {
      this.logger.error(
        `[ONLYOFFICE callback] failed to download edited file for file=${fileId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
    const buffer = Buffer.from(response.data);
    const nextVersion = (file.currentVersion || 0) + 1;
    const key =
      `workspaces/${file.workspace.workspaceId}/files/${file.fileId}` +
      `/versions/v${nextVersion}/${this.sanitizeFileName(file.name)}`;
    const mimeType = this.getMimeTypeByFileName(file.name, file.mimeType);

    let uploaded;
    try {
      uploaded = await this.s3UploadService.uploadBufferToKey(
        buffer,
        key,
        mimeType,
      );
    } catch (error) {
      this.logger.error(
        `[ONLYOFFICE callback] failed to upload version for file=${fileId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }

    file.url = uploaded.url;
    file.s3Key = uploaded.key;
    file.size = buffer.length;
    file.mimeType = mimeType;
    file.currentVersion = nextVersion;

    const savedFile = await this.fileRepo.save(file);
    const editedById = body.users?.[0];
    const editedBy = editedById
      ? await this.userRepo.findOne({ where: { userId: editedById } })
      : null;

    await this.createFileVersion(
      savedFile,
      nextVersion,
      {
        name: file.name,
        mimeType,
        size: buffer.length,
        url: uploaded.url,
        s3Key: uploaded.key,
      },
      editedBy,
    );

    this.logger.log(
      `[ONLYOFFICE callback] saved file=${fileId} version=${nextVersion} s3Key=${uploaded.key}`,
    );

    return { error: 0 };
  }

  private getOfficeFileType(name: string, mimeType?: string | null) {
    const extension = extname(name).replace('.', '').toLowerCase();
    if (extension === 'doc' || extension === 'docx' || extension === 'xlsx') {
      return extension;
    }

    const mime = mimeType || '';
    if (mime.includes('word') || mime.includes('msword')) return 'docx';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
    return null;
  }

  private getMimeTypeByFileName(name: string, fallback?: string | null) {
    const extension = extname(name).replace('.', '').toLowerCase();
    if (extension === 'doc') return 'application/msword';
    if (extension === 'xlsx') {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (extension === 'docx') {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return fallback || 'application/octet-stream';
  }

  private resolveDocumentServerUrl() {
    return (
      this.configService.get<string>('ONLYOFFICE_DOCUMENT_SERVER_URL') ||
      'http://localhost:8080'
    ).replace(/\/+$/, '');
  }

  private resolveAppBaseUrl() {
    const fallbackPort = this.configService.get<string>('PORT') || '3000';
    return (
      this.configService.get<string>('ONLYOFFICE_CALLBACK_BASE_URL') ||
      this.configService.get<string>('APP_BASE_URL') ||
      `http://localhost:${fallbackPort}`
    ).replace(/\/+$/, '');
  }

  private signOnlyOfficeCallbackToken(fileId: string) {
    return createHmac('sha256', this.getOnlyOfficeCallbackSecret())
      .update(fileId)
      .digest('hex');
  }

  private verifyOnlyOfficeCallbackToken(fileId: string, token?: string) {
    if (!token) return false;
    return token === this.signOnlyOfficeCallbackToken(fileId);
  }

  private getOnlyOfficeCallbackSecret() {
    return (
      this.configService.get<string>('ONLYOFFICE_CALLBACK_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'onlyoffice-local-secret'
    );
  }

  async createFolder(
    workspaceId: string,
    dto: CreateWorkspaceFileDto,
    userId: string,
  ) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!dto.name?.trim()) {
      throw new BadRequestException('Folder name is required');
    }

    let parent: WorkspaceFile | null = null;
    if (dto.parentId) {
      parent = await this.fileRepo.findOne({
        where: { fileId: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent folder not found');
    }

    const folder = this.fileRepo.create({
      name: dto.name,
      type: 'folder',
      accessLevel: dto.accessLevel || 'workspace',
      workspace,
      uploadedBy: user,
      parent,
    });

    return this.fileRepo.save(folder);
  }

  async findByWorkspace(workspaceId: string, parentId?: string) {
    const where: any = {
      workspace: { workspaceId },
    };

    if (parentId) {
      where.parent = { fileId: parentId };
    } else {
      where.parent = IsNull();
    }

    return this.fileRepo.find({
      where,
      relations: ['uploadedBy'],
      order: { type: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string) {
    const file = await this.fileRepo.findOne({
      where: { fileId: id },
      relations: ['uploadedBy', 'workspace', 'parent', 'versions'],
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async update(id: string, dto: UpdateWorkspaceFileDto) {
    const file = await this.findOne(id);

    if (dto.name !== undefined) file.name = dto.name;
    if (dto.mimeType !== undefined) file.mimeType = dto.mimeType;
    if (dto.size !== undefined) file.size = dto.size;
    if (dto.url !== undefined) file.url = dto.url;
    if (dto.accessLevel !== undefined) file.accessLevel = dto.accessLevel;

    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        const parent = await this.fileRepo.findOne({
          where: { fileId: dto.parentId },
        });
        if (!parent) throw new NotFoundException('Parent folder not found');
        file.parent = parent;
      } else {
        file.parent = null;
      }
    }

    return this.fileRepo.save(file);
  }

  async remove(id: string) {
    const file = await this.findOne(id);
    return this.fileRepo.remove(file);
  }
}
