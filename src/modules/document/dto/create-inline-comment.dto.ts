import { IsString, IsOptional } from 'class-validator';

export class CreateInlineCommentDto {
  @IsString()
  selectedText: string;

  @IsString()
  text: string;

  @IsString()
  authorId: string;

  @IsOptional()
  @IsString()
  parentCommentId?: string;
}
