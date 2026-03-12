import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CallOfferDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @IsObject()
  offer: RTCSessionDescriptionInit;
}

export class CallAnswerDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsString()
  @IsNotEmpty()
  callerId: string;

  @IsObject()
  answer: RTCSessionDescriptionInit;
}

export class IceCandidateDto {
  @IsString()
  @IsNotEmpty()
  callId: string;

  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @IsObject()
  candidate: RTCIceCandidateInit;
}
