import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAttachmentDto {
  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  @IsString()
  uploadedById?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;
}
