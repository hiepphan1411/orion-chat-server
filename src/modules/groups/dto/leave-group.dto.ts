import { IsOptional, IsUUID } from 'class-validator';

export class LeaveGroupDto {
  @IsOptional()
  @IsUUID()
  newAdminUserId?: string;
}
