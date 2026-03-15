import { IsEnum } from 'class-validator';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';

export class UpdateMemberRoleDto {
  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;
}
