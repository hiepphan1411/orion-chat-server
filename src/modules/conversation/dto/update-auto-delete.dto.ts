import { IsNumber, Min, Max, IsOptional } from 'class-validator';

/**
 * DTO để cập nhật thời gian tự xóa tin nhắn cho conversation
 * @param autoDeleteDuration Số ngày trước khi tin nhắn tự xóa (0 = không tự xóa)
 */
export class UpdateAutoDeleteDTO {
  @IsNumber()
  @Min(0)
  @Max(365)
  autoDeleteDuration!: number;
}
