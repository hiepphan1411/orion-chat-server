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

@Controller('workspaces/:workspaceId/members')
@UseGuards(JwtAuthGuard)
export class WorkspaceMemberController {
  constructor(private readonly memberService: WorkspaceMemberService) {}

  @Post()
  addMember(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.memberService.addMember(workspaceId, dto);
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
  ) {
    if (dto.method === 'phone') {
      return this.memberService.inviteByPhone(
        workspaceId,
        dto.value,
        dto.role || WorkspaceRole.MEMBER,
      );
    } else {
      // value là userId khi method = 'name'
      return this.memberService.inviteByName(
        workspaceId,
        dto.value,
        dto.role || WorkspaceRole.MEMBER,
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
  ) {
    return this.memberService.generateInviteLink(workspaceId, role);
  }

  @Patch(':userId')
  updateRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.memberService.updateRole(workspaceId, userId, dto);
  }

  @Delete(':userId')
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.memberService.removeMember(workspaceId, userId);
  }
}
