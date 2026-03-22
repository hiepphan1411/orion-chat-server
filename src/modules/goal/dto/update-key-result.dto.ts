import { PartialType } from '@nestjs/mapped-types';
import { CreateKeyResultDto } from './create-key-result.dto';

export class UpdateKeyResultDto extends PartialType(CreateKeyResultDto) {}
