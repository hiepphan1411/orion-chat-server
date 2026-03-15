import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

/**
 * API Workspace
 *
 * POST   /workspaces                → Tạo workspace mới (body: CreateWorkspaceDto)
 *   - Tự động thêm ownerId vào members với role OWNER
 *   - Trả về workspace đầy đủ kèm members, boards
 *
 * GET    /workspaces?userId=xxx     → Lấy tất cả workspace mà user tham gia
 *   - Query param: userId (bắt buộc) - ID của user cần lấy workspace
 *   - Trả về mảng workspace kèm members, boards
 *
 * GET    /workspaces/:id            → Lấy chi tiết 1 workspace
 *   - Trả về workspace kèm owner, members (user), boards (columns)
 *
 * PATCH  /workspaces/:id            → Cập nhật workspace (partial update)
 *   - Body: bất kỳ field nào của CreateWorkspaceDto
 *
 * DELETE /workspaces/:id            → Xóa workspace (cascade xóa members, boards)
 */
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  create(@Body() dto: CreateWorkspaceDto) {
    return this.workspaceService.create(dto);
  }

  @Get()
  findAll(@Query('userId') userId: string) {
    return this.workspaceService.findAllForUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workspaceService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaceService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workspaceService.remove(id);
  }
}
