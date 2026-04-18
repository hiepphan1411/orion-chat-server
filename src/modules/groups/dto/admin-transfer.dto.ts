import { IsUUID } from 'class-validator';

export class AdminTransferDto {
  @IsUUID()
  targetUserId!: string;
}
