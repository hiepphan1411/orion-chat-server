import { IsString, IsNumber } from 'class-validator';

export class CreateAttachmentDto {
  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsString()
  fileType: string;

  @IsNumber()
  fileSize: number;

  @IsString()
  uploadedById: string;
}
