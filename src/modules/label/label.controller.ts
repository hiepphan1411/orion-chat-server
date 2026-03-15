import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { LabelService } from './label.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

/**
 * API Labels
 *
 * POST   /workspaces/:workspaceId/labels             → Tạo label mới
 *   - Body: { text, color, type }
 *   - type: 'FEATURE' | 'BUG' | 'DESIGN' | 'URGENT' | 'IMPROVEMENT'
 *
 * GET    /workspaces/:workspaceId/labels             → Danh sách labels
 *   - Trả về tất cả labels trong workspace
 *
 * PATCH  /workspaces/:workspaceId/labels/:id         → Cập nhật label
 *   - Body: bất kỳ field (text, color, type)
 *
 * DELETE /workspaces/:workspaceId/labels/:id         → Xóa label
 */
@Controller('workspaces/:workspaceId/labels')
export class LabelController {
  constructor(private readonly labelService: LabelService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateLabelDto,
  ) {
    return this.labelService.create(workspaceId, dto);
  }

  @Get()
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.labelService.findByWorkspace(workspaceId);
  }

  @Patch(':id')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.labelService.remove(workspaceId, id);
  }
}
