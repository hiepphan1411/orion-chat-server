import { Controller, Get, Post, Body } from '@nestjs/common';
import { MessageService } from './message.service';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  findAll() {
    return this.messageService.findAll();
  }

  @Post()
  create(
    @Body()
    body: {
      conversationId: string;
      senderBy: string;
      content: string;
      messageType?: string;
      replyToMessageId?: string;
      clientMessageId?: string;
    },
  ) {
    return this.messageService.createMessage(body);
  }
}
