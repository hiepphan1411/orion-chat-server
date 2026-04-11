import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO để ẩn cuộc trò chuyện bằng mật khẩu
 */
export class HideConversationDTO {
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  password!: string;
}

/**
 * DTO để tiết lộ cuộc trò chuyện bị ẩn (nhập mật khẩu)
 */
export class RevealConversationDTO {
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  password!: string;
}

/**
 * DTO để truy cập conversation bị ẩn
 */
export class AccessHiddenConversationDTO {
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  password!: string;
}
