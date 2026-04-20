import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  UploadedFile,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { JwtPayload } from 'jsonwebtoken';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatGateway } from '../message/chat.gateway';
import { AddGroupMembersDto } from './dto/add-group-members.dto';
import { AdminTransferDto } from './dto/admin-transfer.dto';
import { LeaveGroupDto } from './dto/leave-group.dto';
import { UpdateGroupAutoDeleteDto } from './dto/update-group-auto-delete.dto';
import { UpdateGroupNameDto } from './dto/update-group-name.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
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

  @Delete(':groupId/members/:userId')
  async removeMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.removeMember(
      groupId,
      user.userId,
      userId,
    );

    this.chatGateway.emitGroupMemberLeft({
      groupId,
      userId,
      leftAt: result.removedAt,
      groupDeleted: false,
    });

    return result;
  }

  @Patch(':groupId/members/:userId/role')
  async updateMemberRole(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    return this.groupsService.updateMemberRole(
      groupId,
      user.userId,
      userId,
      dto.role,
    );
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

  @Patch(':groupId/name')
  async updateGroupName(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateGroupNameDto,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.updateGroupName(
      groupId,
      user.userId,
      dto.groupName,
    );

    this.chatGateway.emitGroupInfoUpdated({
      groupId,
      groupName: result.groupName,
      updatedBy: result.updatedBy,
      updatedAt: result.updatedAt,
    });

    return result;
  }

  @Patch(':groupId/avatar')
  @UseInterceptors(FileInterceptor('file'))
  async updateGroupAvatar(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!user?.userId) throw new BadRequestException('User ID is required');

    const result = await this.groupsService.updateGroupAvatar(
      groupId,
      user.userId,
      file,
    );

    this.chatGateway.emitGroupInfoUpdated({
      groupId,
      groupAvatar: result.groupAvatar,
      updatedBy: result.updatedBy,
      updatedAt: result.updatedAt,
    });

    return result;
  }
}
