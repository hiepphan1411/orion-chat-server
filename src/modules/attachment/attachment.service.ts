import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from './entities/attachment.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(Attachment)
    private attachmentRepo: Repository<Attachment>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(taskId: string, dto: CreateAttachmentDto) {
    const task = await this.taskRepo.findOne({ where: { taskId } });
    if (!task) throw new NotFoundException('Task not found');

    const uploadedBy = await this.userRepo.findOne({
      where: { userId: dto.uploadedById },
    });
    if (!uploadedBy) throw new NotFoundException('Uploader user not found');

    const attachment = this.attachmentRepo.create({
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      fileType: dto.fileType,
      fileSize: dto.fileSize,
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
}
