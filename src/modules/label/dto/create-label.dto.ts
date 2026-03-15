import { IsString, IsEnum } from 'class-validator';
import { LabelType } from 'src/common/enums/label-type.enum';

export class CreateLabelDto {
  @IsString()
  text: string;

  @IsString()
  color: string;

  @IsEnum(LabelType)
  type: LabelType;
}
