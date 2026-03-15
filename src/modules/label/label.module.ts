import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Label } from './entities/label.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { LabelService } from './label.service';
import { LabelController } from './label.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Label, Workspace])],
  controllers: [LabelController],
  providers: [LabelService],
  exports: [LabelService],
})
export class LabelModule {}
