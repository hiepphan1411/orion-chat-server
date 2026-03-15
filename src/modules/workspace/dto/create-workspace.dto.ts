import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsInt,
  Min,
  IsUUID,
} from 'class-validator';
import { WorkspaceType } from 'src/common/enums/workspace-type.enum';

export class CreateWorkspaceDto {
  @IsString()
  @MaxLength(50)
  workspaceName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(WorkspaceType)
  type: WorkspaceType;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  memberLimit?: number;
  //TODO: Test
  // @IsString()
  @IsUUID()
  ownerId: string;
}
