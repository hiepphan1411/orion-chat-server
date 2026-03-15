import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskBoardDto } from './create-task-board.dto';

export class UpdateTaskBoardDto extends PartialType(CreateTaskBoardDto) {}
