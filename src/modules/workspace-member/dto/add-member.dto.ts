import { IsString, IsEnum } from 'class-validator';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';

export class AddMemberDto {
  @IsString()
  userId: string;

  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;
}
