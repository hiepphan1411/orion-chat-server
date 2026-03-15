import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersonalNote } from './entities/note.entity';
import { NoteCategory } from './entities/note-category.entity';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note-dto';
import { CategoriesService } from './categories.service';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(PersonalNote)
    private noteRepository: Repository<PersonalNote>,

    @InjectRepository(NoteCategory)
    private categoryRepository: Repository<NoteCategory>,

    private categoriesService: CategoriesService,
  ) {}

  /**
   * tạo note mới
   */
  async create(
    userId: string,
    createNoteDto: CreateNoteDto,
  ): Promise<PersonalNote> {
    // check xem category có tồn tại không
    const category = await this.categoryRepository.findOne({
      where: { categoryId: createNoteDto.categoryId, userId },
    });

    if (!category) {
      throw new BadRequestException(
        'Category not found or does not belong to this user',
      );
    }

    // create note mới
    const note = this.noteRepository.create({
      ...createNoteDto,
      userId,
    });

    const savedNote = await this.noteRepository.save(note);

    // Reload note từ database để có category relation
    return (await this.noteRepository.findOne({
      where: { noteId: savedNote.noteId, userId },
      relations: ['category'],
    }))!;
  }

  /**
   * lấy tất cả notes của user (có filter, search, pagination)
   */
  async findAll(
    userId: string,
    queryDto: QueryNoteDto,
  ): Promise<{
    notes: PersonalNote[];
    total: number;
  }> {
    const {
      categoryId,
      isPinned,
      folderId,
      search,
      skip = 0,
      take = 20,
    } = queryDto;

    const queryBuilder = this.noteRepository
      .createQueryBuilder('note')
      .where('note.userId = :userId', { userId })
      .leftJoinAndSelect('note.category', 'category');

    // filter theo category
    if (categoryId) {
      queryBuilder.andWhere('note.categoryId = :categoryId', { categoryId });
    }

    // filter theo pinned status
    if (isPinned !== undefined) {
      queryBuilder.andWhere('note.isPinned = :isPinned', { isPinned });
    }

    // filter theo folder
    if (folderId) {
      queryBuilder.andWhere('note.folderId = :folderId', { folderId });
    }

    // search trong title or content
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(note.title) LIKE LOWER(:search) OR LOWER(note.content) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // sort: pinned lên đầu, sau đó theo createDate DESC
    queryBuilder
      .orderBy('note.isPinned', 'DESC')
      .addOrderBy('note.createdAt', 'DESC');

    // pagination
    queryBuilder.skip(skip).take(take);

    const [notes, total] = await queryBuilder.getManyAndCount();

    return { notes, total };
  }

  /**
   * lấy note theo id
   */
  async findOne(noteId: string, userId: string): Promise<PersonalNote> {
    const note = await this.noteRepository.findOne({
      where: { noteId, userId },
      relations: ['category'],
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  /**
   * update note
   */
  async update(
    noteId: string,
    userId: string,
    updateNoteDto: UpdateNoteDto,
  ): Promise<PersonalNote> {
    // check note tồn tại (throws NotFoundException nếu không tìm được)
    await this.findOne(noteId, userId);

    // nếu đổi category, kiểm tra category mới có tồn tại không
    if (updateNoteDto.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { categoryId: updateNoteDto.categoryId, userId },
      });

      if (!category) {
        throw new BadRequestException(
          'Category not found or does not belong to this user',
        );
      }
    }

    // Build update query using QueryBuilder
    const updateData: Partial<PersonalNote> = {};
    if (updateNoteDto.title !== undefined) {
      updateData.title = updateNoteDto.title;
    }
    if (updateNoteDto.content !== undefined) {
      updateData.content = updateNoteDto.content;
    }
    if (updateNoteDto.categoryId !== undefined) {
      updateData.categoryId = updateNoteDto.categoryId;
    }
    if (updateNoteDto.isPinned !== undefined) {
      updateData.isPinned = updateNoteDto.isPinned;
    }
    if (updateNoteDto.folderId !== undefined) {
      updateData.folderId = updateNoteDto.folderId;
    }

    await this.noteRepository
      .createQueryBuilder()
      .update(PersonalNote)
      .set(updateData)
      .where('noteId = :noteId AND userId = :userId', { noteId, userId })
      .execute();

    // Reload note từ database để có category relation mới nhất
    return (await this.noteRepository.findOne({
      where: { noteId, userId },
      relations: ['category'],
    }))!;
  }

  /**
   * delete note
   */
  async delete(noteId: string, userId: string): Promise<{ message: string }> {
    const note = await this.findOne(noteId, userId);

    await this.noteRepository.remove(note);

    return { message: 'Note deleted successfully' };
  }

  /**
   * toggle pin status
   */
  async togglePin(noteId: string, userId: string): Promise<PersonalNote> {
    const note = await this.findOne(noteId, userId);

    note.isPinned = !note.isPinned;

    await this.noteRepository.save(note);

    // Reload note từ database để có category relation mới nhất
    return (await this.noteRepository.findOne({
      where: { noteId, userId },
      relations: ['category'],
    }))!;
  }
}
