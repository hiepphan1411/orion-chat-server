import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AIChatSession,
  AIChatSessionDocument,
} from './ai-chat-sesstion.schema';

@Injectable()
export class AIChatSessionService {
  constructor(
    @InjectModel(AIChatSession.name)
    private sessionModel: Model<AIChatSessionDocument>,
  ) {}

  async createSession(
    userId: string,
    aiModel: string,
    systemPrompt?: string,
  ): Promise<AIChatSession> {
    const session = new this.sessionModel({ userId, aiModel, systemPrompt });
    return session.save();
  }

  async getSessionsByUser(userId: string): Promise<AIChatSession[]> {
    return this.sessionModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async getSessionById(sessionId: string): Promise<AIChatSession | null> {
    return this.sessionModel.findById(sessionId).exec();
  }

  async updateSession(
    sessionId: string,
    update: Partial<{ aiModel: string; systemPrompt: string }>,
  ): Promise<AIChatSession | null> {
    return this.sessionModel
      .findByIdAndUpdate(sessionId, update, { new: true })
      .exec();
  }

  async deleteSession(sessionId: string): Promise<AIChatSession | null> {
    return this.sessionModel.findByIdAndDelete(sessionId).exec();
  }
}
