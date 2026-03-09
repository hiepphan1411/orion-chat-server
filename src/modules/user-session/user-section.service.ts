/* eslint-disable */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserSessionDto } from './dto/user-section.dto';
import { UserSession } from './entities/user-section.entity';
import { CreateUserSessionDto } from './dto/create-user.dto';

//Để test

@Injectable()
export class UserSessionService {
  constructor(
    @InjectRepository(UserSession)
    private userSessionRepository: Repository<UserSession>,
  ) {}

  // create(dto: CreateUserSessionDto) {
  //   const userSession = this.userSessionRepository.create(dto);
  //   return this.userSessionRepository.save(userSession);
  // }

  findAll() {
    return this.userSessionRepository.find();
  }

  async findOne(id: string) {
    const userSession = await this.userSessionRepository.findOne({
      where: { sessionId: id },
    });

    if (!userSession) throw new NotFoundException('User session not found');

    return userSession;
  }

  // async update(id: string, dto: UpdateUserSessionDto) {
  //   await this.userSessionRepository.update(id, dto);
  //   return this.findOne(id);
  // }

  async remove(id: string) {
    const userSession = await this.findOne(id);
    return this.userSessionRepository.remove(userSession);
  }
}
