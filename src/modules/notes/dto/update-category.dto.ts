import {
  IsString,
  IsOptional,
  IsHexColor,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9\s\-_]+$/, {
    message:
      'Category name can only contain letters, numbers, spaces, hyphens, and underscores',
  })
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;
}
