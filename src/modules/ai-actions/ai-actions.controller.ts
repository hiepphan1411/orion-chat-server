import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "src/common/decorators/current-user.decorator";
import { AIActionsService } from "./ai-actions.service";
import type { AIActionSuggestion } from "./ai-action.types";

@Controller("ai-actions")
@UseGuards(JwtAuthGuard)
export class AIActionsController {
  constructor(private readonly aiActionsService: AIActionsService) {}

  @Post("execute")
  executeAction(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { action?: AIActionSuggestion },
  ) {
    if (!body?.action) {
      return {
        status: "rejected",
        message: "Missing action payload",
      };
    }

    return this.aiActionsService.execute(user.userId, body.action);
  }
}
