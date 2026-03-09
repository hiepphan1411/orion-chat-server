import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @MinLength(1, { message: 'Title cannot be empty' })
  @MaxLength(255, { message: 'Title too long (max 255 characters)' })
  title: string;

  @IsString()
  @MinLength(1, { message: 'Content cannot be empty' })
  content: string;

  @IsUUID('4', { message: 'Invalid category ID' })
  categoryId: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsUUID('4')
  folderId?: string;
}
