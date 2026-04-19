import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from 'jsonwebtoken';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatGateway } from '../message/chat.gateway';
import { AddGroupMembersDto } from './dto/add-group-members.dto';
import { AdminTransferDto } from './dto/admin-transfer.dto';
import { LeaveGroupDto } from './dto/leave-group.dto';
import { UpdateGroupAutoDeleteDto } from './dto/update-group-auto-delete.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get(':groupId/members')
  async getMembers(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    return this.groupsService.getMembers(groupId, user.userId);
  }

  @Post(':groupId/members')
  async addMembers(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddGroupMembersDto,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.addMembers(
      groupId,
      user.userId,
      dto.userIds,
    );

    this.chatGateway.emitGroupMembersAdded({
      groupId,
      addedBy: user.userId,
      userIds: result.addedUserIds,
      addedAt: result.addedAt,
    });

    return result;
  }

  @Patch(':groupId/admin-transfer')
  async transferAdmin(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AdminTransferDto,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.transferAdmin(
      groupId,
      user.userId,
      dto.targetUserId,
    );

    this.chatGateway.emitGroupAdminTransferred({
      groupId,
      oldAdminUserId: result.oldAdminUserId,
      newAdminUserId: result.newAdminUserId,
      transferredAt: result.transferredAt,
    });

    return result;
  }

  @Post(':groupId/leave')
  async leaveGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: LeaveGroupDto,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.leaveGroup(
      groupId,
      user.userId,
      dto.newAdminUserId,
    );

    this.chatGateway.emitGroupMemberLeft({
      groupId,
      userId: user.userId,
      leftAt: result.leftAt,
      groupDeleted: result.groupDeleted,
    });

    return result;
  }

  @Patch(':groupId/settings/auto-delete')
  async updateAutoDelete(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateGroupAutoDeleteDto,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.updateAutoDelete(
      groupId,
      user.userId,
      dto.autoDeleteDuration,
    );

    this.chatGateway.emitGroupAutoDeleteUpdated({
      groupId,
      autoDeleteDuration: result.autoDeleteDuration,
      updatedBy: result.updatedBy,
      updatedAt: result.updatedAt,
    });

    return result;
  }

  @Post(':groupId/dissolve')
  async dissolveGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.dissolveGroup(groupId, user.userId);

    this.chatGateway.emitGroupDissolved({
      groupId,
      dissolvedBy: result.dissolvedBy,
      dissolvedAt: result.dissolvedAt,
    });

    return result;
  }
}
