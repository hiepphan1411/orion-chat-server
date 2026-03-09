import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AIMessage, AIMessageDocument } from './ai-message.schema';
import { AIMessageRole } from 'src/common/enums/ai-message-role.enum';

@Injectable()
export class AIMessageService {
  constructor(
    @InjectModel(AIMessage.name)
    private messageModel: Model<AIMessageDocument>,
  ) {}

  async createMessage(
    sessionId: string,
    content: string,
    aiMessageRole: AIMessageRole,
    tokenUsed?: number,
  ): Promise<AIMessage> {
    const message = new this.messageModel({
      sessionId: new Types.ObjectId(sessionId),
      content,
      aiMessageRole,
      tokenUsed,
    });
    return message.save();
  }

  async getMessagesBySession(sessionId: string): Promise<AIMessage[]> {
    return this.messageModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  async getMessageById(messageId: string): Promise<AIMessage | null> {
    return this.messageModel.findById(messageId).exec();
  }

  async deleteMessage(messageId: string): Promise<AIMessage | null> {
    return this.messageModel.findByIdAndDelete(messageId).exec();
  }

  async deleteMessagesBySession(sessionId: string): Promise<void> {
    await this.messageModel
      .deleteMany({ sessionId: new Types.ObjectId(sessionId) })
      .exec();
  }
}
