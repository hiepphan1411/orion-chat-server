import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from './entities/attachment.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { S3UploadService } from 'src/common/services/s3-upload.service';

@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(Attachment)
    private attachmentRepo: Repository<Attachment>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private s3UploadService: S3UploadService,
  ) {}

  async create(
    taskId: string,
    dto: CreateAttachmentDto,
    file?: Express.Multer.File,
    authenticatedUserId?: string,
  ) {
    const task = await this.taskRepo.findOne({ where: { taskId } });
    if (!task) throw new NotFoundException('Task not found');

    const uploaderId = dto.uploadedById || authenticatedUserId;
    if (!uploaderId) {
      throw new BadRequestException('uploadedById is required');
    }

    const uploadedBy = await this.userRepo.findOne({
      where: { userId: uploaderId },
    });
    if (!uploadedBy) throw new NotFoundException('Uploader user not found');

    const attachmentData = await this.resolveAttachmentData(taskId, dto, file);

    const attachment = this.attachmentRepo.create({
      fileName: attachmentData.fileName,
      fileUrl: attachmentData.fileUrl,
      fileType: attachmentData.fileType,
      fileSize: attachmentData.fileSize,
      task,
      uploadedBy,
    });

    return this.attachmentRepo.save(attachment);
  }

  async findByTask(taskId: string) {
    return this.attachmentRepo.find({
      where: { task: { taskId } },
      order: { uploadedAt: 'DESC' },
    });
  }

  async remove(id: string) {
    const attachment = await this.attachmentRepo.findOne({
      where: { attachmentId: id },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return this.attachmentRepo.remove(attachment);
  }

  private async resolveAttachmentData(
    taskId: string,
    dto: CreateAttachmentDto,
    file?: Express.Multer.File,
  ) {
    if (file) {
      const uploadResult = await this.s3UploadService.uploadFile(
        file,
        `tasks/${taskId}/attachments`,
      );

      return {
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        fileType: file.mimetype,
        fileSize: file.size,
      };
    }

    if (!dto.fileName || !dto.fileUrl || !dto.fileType || !dto.fileSize) {
      throw new BadRequestException(
        'file metadata is required when no file is uploaded',
      );
    }

    return {
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      fileType: dto.fileType,
      fileSize: dto.fileSize,
    };
  }
}
