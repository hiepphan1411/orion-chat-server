import { Controller, Get, Post, Body } from '@nestjs/common';
import { CreateUserSessionDto } from './dto/create-user.dto';
import { UserSessionService } from './user-section.service';

@Controller('user-section')
export class UserSectionController {
  constructor(private readonly userSectionService: UserSessionService) {}

  // @Post()
  // create(@Body() createUserDto: CreateUserSessionDto) {
  //   return this.userSectionService.create(createUserDto);
  // }

  @Get()
  findAll() {
    return this.userSectionService.findAll();
  }
}
