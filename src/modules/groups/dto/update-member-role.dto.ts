import { IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsIn(['co-admin', 'member'])
  role!: 'co-admin' | 'member';
}
