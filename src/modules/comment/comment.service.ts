import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { Task } from '../task/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private commentRepo: Repository<Comment>,
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(taskId: string, dto: CreateCommentDto) {
    const task = await this.taskRepo.findOne({ where: { taskId } });
    if (!task) throw new NotFoundException('Task not found');

    const author = await this.userRepo.findOne({
      where: { userId: dto.authorId },
    });
    if (!author) throw new NotFoundException('Author user not found');

    const comment = this.commentRepo.create({
      content: dto.content,
      task,
      author,
    });

    return this.commentRepo.save(comment);
  }

  async findByTask(taskId: string) {
    return this.commentRepo.find({
      where: { task: { taskId } },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateCommentDto) {
    const comment = await this.commentRepo.findOne({
      where: { commentId: id },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    if (dto.content !== undefined) comment.content = dto.content;

    await this.commentRepo.save(comment);
    return this.commentRepo.findOne({
      where: { commentId: id },
      relations: ['author'],
    });
  }

  async remove(id: string) {
    const comment = await this.commentRepo.findOne({
      where: { commentId: id },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return this.commentRepo.remove(comment);
  }
}
