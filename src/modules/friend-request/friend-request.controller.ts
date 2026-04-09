import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { FriendRequestService } from './friend-request.service';

@Controller('friend-requests')
export class FriendRequestController {
  constructor(private readonly friendRequestService: FriendRequestService) {}

  @Post()
  sendRequest(@Body() body: { senderId: string; receiverId: string }) {
    return this.friendRequestService.sendRequest(
      body.senderId,
      body.receiverId,
    );
  }

  @Get('incoming')
  getIncoming(@Query('userId') userId: string) {
    return this.friendRequestService.getIncoming(userId);
  }

  @Get('outgoing')
  getOutgoing(@Query('userId') userId: string) {
    return this.friendRequestService.getOutgoing(userId);
  }

  @Patch(':id/accept')
  acceptRequest(
    @Param('id') requestId: string,
    @Body() body: { userId: string },
  ) {
    return this.friendRequestService.acceptRequest(requestId, body.userId);
  }

  @Patch(':id/decline')
  declineRequest(
    @Param('id') requestId: string,
    @Body() body: { userId: string },
  ) {
    return this.friendRequestService.declineRequest(requestId, body.userId);
  }
}
