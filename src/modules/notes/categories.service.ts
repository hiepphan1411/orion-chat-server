import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NoteCategory } from './entities/note-category.entity';
import { PersonalNote } from '../personal-note/personal-note.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(NoteCategory)
    private categoryRepository: Repository<NoteCategory>,

    @InjectRepository(PersonalNote)
    private noteRepository: Repository<PersonalNote>,
  ) {}

  async createDefaultCategories(userId: string): Promise<NoteCategory[]> {
    const defaultCategories = [
      {
        name: 'finance',
        color: '#10B981',
        icon: 'cash-outline',
        isDefault: true,
      },
      {
        name: 'sport',
        color: '#F59E0B',
        icon: 'football-outline',
        isDefault: true,
      },
      {
        name: 'personal',
        color: '#3B82F6',
        icon: 'person-outline',
        isDefault: true,
      },
      {
        name: 'work',
        color: '#8B5CF6',
        icon: 'briefcase-outline',
        isDefault: true,
      },
    ];

    const categories = defaultCategories.map((cat) =>
      this.categoryRepository.create({ ...cat, userId }),
    );

    return await this.categoryRepository.save(categories);
  }

  /**
   * tạo category mới
   */
  async create(
    userId: string,
    createCategoryDto: CreateCategoryDto,
  ): Promise<NoteCategory> {
    // check trùng tên category trong cùng user
    const existing = await this.categoryRepository.findOne({
      where: { userId, name: createCategoryDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Category "${createCategoryDto.name}" already exists`,
      );
    }

    const category = this.categoryRepository.create({
      ...createCategoryDto,
      userId,
      color: createCategoryDto.color || '#3B82F6',
      isDefault: false,
    });

    return await this.categoryRepository.save(category);
  }

  /**
   * lấy all categories của user, sắp xếp mặc định lên đầu, sau đó theo tên
   */
  async findAllByUser(userId: string): Promise<NoteCategory[]> {
    const categories = await this.categoryRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', name: 'ASC' },
    });

    // tự động tạo default categories nếu user chưa có category nào
    if (categories.length === 0) {
      return await this.createDefaultCategories(userId);
    }

    return categories;
  }

  /**
   * lấy 1 category theo id, đảm bảo category thuộc về user
   */
  async findOne(categoryId: string, userId: string): Promise<NoteCategory> {
    const category = await this.categoryRepository.findOne({
      where: { categoryId, userId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  /**
   * lấy category theo name
   */
  async findByName(name: string, userId: string): Promise<NoteCategory | null> {
    return await this.categoryRepository.findOne({
      where: { name, userId },
    });
  }

  /**
   * update category
   */
  async update(
    categoryId: string,
    userId: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<NoteCategory> {
    const category = await this.findOne(categoryId, userId);

    // check trùng tên nếu đổi tên
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existing = await this.findByName(updateCategoryDto.name, userId);
      if (existing) {
        throw new ConflictException(
          `Category "${updateCategoryDto.name}" already exists`,
        );
      }
    }

    Object.assign(category, updateCategoryDto);
    return await this.categoryRepository.save(category);
  }

  /**
   * delete category
   */
  async remove(categoryId: string, userId: string): Promise<void> {
    const category = await this.findOne(categoryId, userId);

    // không cho phép xóa category mặc định
    if (category.isDefault) {
      throw new BadRequestException('Cannot delete default categories');
    }

    // check nếu còn note nào đang dùng category này, nếu có thì không cho xóa
    const noteCount = await this.noteRepository
      .createQueryBuilder('note')
      .where('note.categoryId = :categoryId', { categoryId })
      .getCount();

    if (noteCount > 0) {
      throw new BadRequestException(
        `Cannot delete category. ${noteCount} note(s) are using this category. Please move or delete them first.`,
      );
    }

    await this.categoryRepository.remove(category);
  }
}
