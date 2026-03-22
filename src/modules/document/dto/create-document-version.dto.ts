import { IsString, IsOptional } from 'class-validator';

export class CreateDocumentVersionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  content: string;

  @IsString()
  editedById: string;
}
