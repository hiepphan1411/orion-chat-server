import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GroupInviteService } from './group-invite.service';

@Controller('group-invites')
export class GroupInviteController {
  constructor(private readonly groupInviteService: GroupInviteService) {}

  @Post()
  sendInvite(
    @Body()
    body: {
      groupId: string;
      inviterId: string;
      inviteeId: string;
    },
  ) {
    return this.groupInviteService.sendInvite(
      body.groupId,
      body.inviterId,
      body.inviteeId,
    );
  }

  @Get('incoming')
  getIncoming(@Query('userId') userId: string) {
    return this.groupInviteService.getIncomingInvites(userId);
  }

  @Get('my-groups')
  getMyGroups(@Query('userId') userId: string) {
    return this.groupInviteService.getMyGroups(userId);
  }

  @Patch(':id/accept')
  acceptInvite(
    @Param('id') inviteId: string,
    @Body() body: { userId: string },
  ) {
    return this.groupInviteService.acceptInvite(inviteId, body.userId);
  }

  @Patch(':id/decline')
  declineInvite(
    @Param('id') inviteId: string,
    @Body() body: { userId: string },
  ) {
    return this.groupInviteService.declineInvite(inviteId, body.userId);
  }
}
