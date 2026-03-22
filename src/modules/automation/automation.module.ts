import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRule } from './entities/automation-rule.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../users/entities/user.entity';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AutomationRule, Workspace, User])],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class AutomationModule {}
