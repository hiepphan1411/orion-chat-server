import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { WorkspaceMemberService } from './workspace-member.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

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
 */
@Controller('workspaces/:workspaceId/members')
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
