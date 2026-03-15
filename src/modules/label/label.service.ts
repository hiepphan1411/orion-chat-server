import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Label } from './entities/label.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelService {
  constructor(
    @InjectRepository(Label)
    private labelRepo: Repository<Label>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
  ) {}

  /**
   * Tạo label mới trong workspace
   */
  async create(workspaceId: string, dto: CreateLabelDto) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const label = this.labelRepo.create({
      text: dto.text,
      color: dto.color,
      type: dto.type,
      workspace,
    });
    return this.labelRepo.save(label);
  }

  /**
   * Lấy tất cả labels trong workspace
   */
  async findByWorkspace(workspaceId: string) {
    return this.labelRepo.find({
      where: { workspace: { workspaceId } },
    });
  }

  /**
   * Cập nhật label
   */
  async update(workspaceId: string, labelId: string, dto: UpdateLabelDto) {
    const label = await this.labelRepo.findOne({
      where: { labelId, workspace: { workspaceId } },
    });
    if (!label) throw new NotFoundException('Label not found');

    Object.assign(label, dto);
    return this.labelRepo.save(label);
  }

  /**
   * Xóa label
   */
  async remove(workspaceId: string, labelId: string) {
    const label = await this.labelRepo.findOne({
      where: { labelId, workspace: { workspaceId } },
    });
    if (!label) throw new NotFoundException('Label not found');
    return this.labelRepo.remove(label);
  }
}
