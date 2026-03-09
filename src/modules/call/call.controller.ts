import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { CallService } from './call.service';
import { CallType } from 'src/common/enums/call-type.enum';

@Controller('calls')
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post()
  async createCall(
    @Body() body: { conversationId: string; callType: CallType },
  ) {
    return this.callService.createCall(body.conversationId, body.callType);
  }

  @Patch(':id/end')
  async endCall(@Param('id') id: string) {
    return this.callService.endCall(id);
  }

  @Get('conversation/:conversationId')
  async getCallsByConversation(
    @Param('conversationId') conversationId: string,
  ) {
    return this.callService.getCallsByConversation(conversationId);
  }

  @Get(':id')
  async getCallById(@Param('id') id: string) {
    return this.callService.getCallById(id);
  }

  @Delete(':id')
  async deleteCall(@Param('id') id: string) {
    return this.callService.deleteCall(id);
  }
}
