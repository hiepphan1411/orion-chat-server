import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WorkspaceMemberService } from './workspace-member.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';

@Controller('workspaces/:workspaceId/members')
@UseGuards(JwtAuthGuard)
export class WorkspaceMemberController {
  constructor(private readonly memberService: WorkspaceMemberService) {}

  @Post()
  addMember(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.addMember(workspaceId, dto, user.userId);
  }

  @Get()
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.memberService.findAllByWorkspace(workspaceId);
  }

  /**
   * Search users by phone or name
   * GET /workspaces/:workspaceId/members/search?q=...
   */
  @Get('search')
  async searchUsers(
    @Param('workspaceId') workspaceId: string,
    @Query('q') query: string,
  ) {
    return this.memberService.searchUsersByName(workspaceId, query);
  }

  /**
   * Invite user by method (phone or name with userId)
   * POST /workspaces/:workspaceId/members/invite
   */
  @Post('invite')
  async inviteByMethod(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { method: 'phone' | 'name'; value: string; role?: WorkspaceRole },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (dto.method === 'phone') {
      return this.memberService.inviteByPhone(
        workspaceId,
        dto.value,
        dto.role || WorkspaceRole.MEMBER,
        user.userId,
      );
    } else {
      // value là userId khi method = 'name'
      return this.memberService.inviteByName(
        workspaceId,
        dto.value,
        dto.role || WorkspaceRole.MEMBER,
        user.userId,
      );
    }
  }

  /**
   * Generate invite link
   * GET /workspaces/:workspaceId/members/invite-link
   */
  @Get('invite-link')
  async getInviteLink(
    @Param('workspaceId') workspaceId: string,
    @Query('role') role: WorkspaceRole = WorkspaceRole.MEMBER,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.generateInviteLink(workspaceId, role, user.userId);
  }

  @Post('join-by-link')
  async joinByLink(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: { token: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.joinByInviteLink(
      workspaceId,
      user.userId,
      dto.token,
    );
  }

  @Get('join-requests')
  async pendingJoinRequests(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.findPendingJoinRequests(workspaceId, user.userId);
  }

  @Post('join-requests/:requestId/approve')
  async approveJoinRequest(
    @Param('workspaceId') workspaceId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.approveJoinRequest(
      workspaceId,
      requestId,
      user.userId,
    );
  }

  @Post('join-requests/:requestId/reject')
  async rejectJoinRequest(
    @Param('workspaceId') workspaceId: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.rejectJoinRequest(
      workspaceId,
      requestId,
      user.userId,
    );
  }

  @Patch(':userId')
  updateRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.updateRole(workspaceId, userId, dto, user.userId);
  }

  @Delete(':userId')
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.memberService.removeMember(workspaceId, userId, user.userId);
  }
}
