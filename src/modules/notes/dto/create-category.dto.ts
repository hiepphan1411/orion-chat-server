import {
  IsString,
  IsOptional,
  IsHexColor,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1, { message: 'Category name cannot be empty' })
  @MaxLength(50, { message: 'Category name too long (max 50)' })
  @Matches(/^[a-zA-Z0-9\s\-_]+$/, {
    message:
      'Category name can only contain letters, numbers, spaces, hyphens, and underscores',
  })
  name: string;

  @IsOptional()
  @IsHexColor({ message: 'Invalid color format (must be like #3B82F6)' })
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;
}
