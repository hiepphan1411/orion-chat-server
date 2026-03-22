import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkspaceFileDto } from './create-workspace-file.dto';

export class UpdateWorkspaceFileDto extends PartialType(
  CreateWorkspaceFileDto,
) {}
