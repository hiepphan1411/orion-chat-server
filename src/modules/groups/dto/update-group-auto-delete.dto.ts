import { IsIn } from 'class-validator';

export class UpdateGroupAutoDeleteDto {
  @IsIn([0, 3600, 86400])
  autoDeleteDuration!: number;
}
