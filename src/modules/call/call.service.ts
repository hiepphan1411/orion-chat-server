import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Call, CallDocument } from './call.schema';
import { CallType } from 'src/common/enums/call-type.enum';

@Injectable()
export class CallService {
  constructor(@InjectModel(Call.name) private callModel: Model<CallDocument>) {}

  async createCall(conversationId: string, callType: CallType): Promise<Call> {
    const newCall = new this.callModel({
      conversationId,
      callType,
      startTime: new Date(),
    });
    return newCall.save();
  }

  async endCall(callId: string): Promise<Call | null> {
    return this.callModel
      .findByIdAndUpdate(callId, { endTime: new Date() }, { new: true })
      .exec();
  }

  async getCallsByConversation(conversationId: string): Promise<Call[]> {
    return this.callModel
      .find({ conversationId })
      .sort({ startTime: -1 })
      .exec();
  }

  async getCallById(callId: string): Promise<Call | null> {
    return this.callModel.findById(callId).exec();
  }

  async deleteCall(callId: string): Promise<Call | null> {
    return this.callModel.findByIdAndDelete(callId).exec();
  }
}
