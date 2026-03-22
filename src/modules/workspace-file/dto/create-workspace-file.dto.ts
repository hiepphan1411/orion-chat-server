import { IsString, IsOptional, IsInt, IsIn } from 'class-validator';

export class CreateWorkspaceFileDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsIn(['file', 'folder'])
  type?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  size?: number;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsIn(['workspace', 'admin_only', 'specific_users'])
  accessLevel?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
