import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';
// import { NoteCategory } from '../entities/note-category.entity';

export class QueryNoteDto {
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID('4')
  folderId?: string;

  @IsOptional()
  @IsBoolean()
  pinnedOnly?: boolean;
}
