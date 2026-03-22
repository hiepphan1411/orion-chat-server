import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationRule } from './entities/automation-rule.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';

@Injectable()
export class AutomationService {
  constructor(
    @InjectRepository(AutomationRule)
    private automationRepo: Repository<AutomationRule>,
    @InjectRepository(Workspace)
    private workspaceRepo: Repository<Workspace>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(workspaceId: string, dto: CreateAutomationDto, userId: string) {
    const workspace = await this.workspaceRepo.findOne({
      where: { workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    const rule = this.automationRepo.create({
      name: dto.name,
      description: dto.description,
      trigger: dto.trigger,
      conditions: dto.conditions,
      action: dto.action,
      workspace,
      createdBy: user,
    });

    return this.automationRepo.save(rule);
  }

  async findByWorkspace(workspaceId: string) {
    return this.automationRepo.find({
      where: { workspace: { workspaceId } },
      relations: ['createdBy', 'workspace'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const rule = await this.automationRepo.findOne({
      where: { ruleId: id },
      relations: ['createdBy', 'workspace'],
    });
    if (!rule) throw new NotFoundException('Automation rule not found');
    return rule;
  }

  async update(id: string, dto: UpdateAutomationDto) {
    const rule = await this.findOne(id);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description;
    if (dto.trigger !== undefined) rule.trigger = dto.trigger;
    if (dto.conditions !== undefined) rule.conditions = dto.conditions;
    if (dto.action !== undefined) rule.action = dto.action;

    return this.automationRepo.save(rule);
  }

  async toggleEnabled(id: string) {
    const rule = await this.findOne(id);
    rule.isEnabled = !rule.isEnabled;
    return this.automationRepo.save(rule);
  }

  async remove(id: string) {
    const rule = await this.findOne(id);
    return this.automationRepo.remove(rule);
  }
}
