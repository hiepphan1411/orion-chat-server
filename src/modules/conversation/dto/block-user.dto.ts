import { IsUUID } from 'class-validator';

/**
 * DTO để chặn hoặc bỏ chặn người dùng trong conversation
 * @param targetUserId UUID của người dùng cần chặn/bỏ chặn
 */
export class BlockUserDTO {
  @IsUUID()
  targetUserId!: string;
}
