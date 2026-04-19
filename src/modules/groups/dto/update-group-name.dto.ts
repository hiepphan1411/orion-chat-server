import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateGroupNameDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  groupName: string;
}
