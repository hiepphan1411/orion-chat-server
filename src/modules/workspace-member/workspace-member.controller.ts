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

/**
 * API Thành viên Workspace
 *
 * POST   /workspaces/:workspaceId/members             → Thêm thành viên
 *   - Body: { userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST' }
 *   - Kiểm tra: user tồn tại, chưa là member, chưa đầy chỗ
 *
 * GET    /workspaces/:workspaceId/members             → Danh sách thành viên
 *   - Trả về mảng member kèm thông tin user
 *   - Sắp xếp theo thời gian tham gia
 *
 * PATCH  /workspaces/:workspaceId/members/:userId     → Đổi role thành viên
 *   - Body: { role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST' }
 *   - Bảo vệ: không cho đổi role OWNER cuối cùng
 *
 * DELETE /workspaces/:workspaceId/members/:userId     → Xóa thành viên
 *   - Bảo vệ: không cho xóa OWNER cuối cùng
 *
 * === New Invite Endpoints ===
 *
 * GET    /workspaces/:workspaceId/members/search?type=phone&value=xxx
 *        /workspaces/:workspaceId/members/search?type=name&value=xxx
 *   - Tìm user theo phone hoặc name
 *   - Trả về user candidates để chọn mời
 *
 * POST   /workspaces/:workspaceId/members/invite-by-phone
 *   - Body: { phoneNumber: string, role?: string }
 *   - Mời user theo số điện thoại
 *
 * POST   /workspaces/:workspaceId/members/invite-by-name
 *   - Body: { userId: string, role?: string }
 *   - Mời user đã search theo name
 *
 * POST   /workspaces/:workspaceId/invite-link
 *   - Tạo invite link (kèm QR code data)
 *
 * POST   /workspaces/:workspaceId/join-by-link
 *   - Body: { userId: string, role?: string }
 *   - Join workspace từ link
 */
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
