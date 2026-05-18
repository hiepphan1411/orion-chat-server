import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkspaceMember } from "../workspace-member/entities/workspace-member.entity";
import { TaskBoard } from "../task-board/entities/task-board.entity";
import { TaskModule } from "../task/task.module";
import { NotificationModule } from "../notifications/notification.module";
import { AIActionsController } from "./ai-actions.controller";
import { AIActionsService } from "./ai-actions.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceMember, TaskBoard]),
    TaskModule,
    NotificationModule,
  ],
  controllers: [AIActionsController],
  providers: [AIActionsService],
  exports: [AIActionsService],
})
export class AIActionsModule {}
