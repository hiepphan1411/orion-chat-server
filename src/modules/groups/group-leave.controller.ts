import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from 'jsonwebtoken';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatGateway } from '../message/chat.gateway';
import { GroupsService } from './groups.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class GroupLeaveController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('leave')
  async leaveGroupCompat(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      groupId?: string;
      conversationId?: string;
      newAdminUserId?: string;
    },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    const groupId = String(body?.groupId || body?.conversationId || '');
    if (!groupId) {
      throw new BadRequestException('groupId is required');
    }

    const result = await this.groupsService.leaveGroup(
      groupId,
      user.userId,
      body?.newAdminUserId,
    );

    if (result.transferredAdmin) {
      this.chatGateway.emitGroupAdminTransferred({
        groupId,
        oldAdminUserId: result.transferredAdmin.oldAdminUserId,
        newAdminUserId: result.transferredAdmin.newAdminUserId,
        transferredAt: result.transferredAdmin.transferredAt,
      });
    }

    this.chatGateway.emitGroupMemberLeft({
      groupId,
      userId: user.userId,
      leftAt: result.leftAt,
      groupDeleted: result.groupDeleted,
    });

    return result;
  }
}
