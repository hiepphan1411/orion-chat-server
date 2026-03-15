import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { NotesService } from './notes.service';
import { CategoriesService } from './categories.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note-dto';
import { PersonalNote } from './entities/note.entity';
import { NoteCategory } from './entities/note-category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * POST /notes
   * Tạo note mới
   */
  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() createNoteDto: CreateNoteDto,
  ): Promise<PersonalNote> {
    return await this.notesService.create(user.userId, createNoteDto);
  }

  /**
   * GET /notes
   * Lấy tất cả notes (có filter, search, pagination)
   */
  @Get()
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() queryDto: QueryNoteDto,
  ): Promise<{ notes: PersonalNote[]; total: number }> {
    return await this.notesService.findAll(user.userId, queryDto);
  }

  /**
   * GET /notes/categories
   * lấy tất cả categories của user
   */
  @Get('categories')
  async getCategories(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<NoteCategory[]> {
    return await this.categoriesService.findAllByUser(user.userId);
  }

  /**
   * POST /notes/categories
   * tạo category mới
   */
  @Post('categories')
  async createCategory(
    @CurrentUser() user: CurrentUserPayload,
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<NoteCategory> {
    return await this.categoriesService.create(user.userId, createCategoryDto);
  }

  /**
   * GET /notes/categories/:id
   * Lấy 1 category
   */
  @Get('categories/:id')
  async getCategory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') categoryId: string,
  ): Promise<NoteCategory> {
    return await this.categoriesService.findOne(categoryId, user.userId);
  }

  /**
   * PUT /notes/categories/:id
   * Update category
   */
  @Put('categories/:id')
  async updateCategory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') categoryId: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<NoteCategory> {
    return await this.categoriesService.update(
      categoryId,
      user.userId,
      updateCategoryDto,
    );
  }

  /**
   * DELETE /notes/categories/:id
   * Xóa category
   */
  @Delete('categories/:id')
  async deleteCategory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') categoryId: string,
  ): Promise<{ message: string }> {
    await this.categoriesService.remove(categoryId, user.userId);
    return { message: 'Category deleted successfully' };
  }

  /**
   * GET /notes/:id
   * Lấy 1 note
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') noteId: string,
  ): Promise<PersonalNote> {
    return await this.notesService.findOne(noteId, user.userId);
  }

  /**
   * PUT /notes/:id
   * Cập nhật note
   */
  @Put(':id')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') noteId: string,
    @Body() updateNoteDto: UpdateNoteDto,
  ): Promise<PersonalNote> {
    return await this.notesService.update(noteId, user.userId, updateNoteDto);
  }

  /**
   * DELETE /notes/:id
   * xóa note
   */
  @Delete(':id')
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') noteId: string,
  ): Promise<{ message: string }> {
    return await this.notesService.delete(noteId, user.userId);
  }

  /**
   * POST /notes/:id/toggle-pin
   * ghi hoặc bỏ ghim note
   */
  @Post(':id/toggle-pin')
  async togglePin(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') noteId: string,
  ): Promise<PersonalNote> {
    return await this.notesService.togglePin(noteId, user.userId);
  }
}
