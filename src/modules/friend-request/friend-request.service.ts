import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FriendRequest,
  FriendRequestStatus,
} from './entities/friend-request.entity';
import { User } from '../users/entities/user.entity';
import { Friendship } from '../friendship/entities/friendship.entity';

@Injectable()
export class FriendRequestService {
  constructor(
    @InjectRepository(FriendRequest)
    private readonly requestRepo: Repository<FriendRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
  ) {}

  async sendRequest(
    senderId: string,
    receiverId: string,
  ): Promise<FriendRequest> {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot add yourself');
    }

    const [sender, receiver] = await Promise.all([
      this.userRepo.findOne({ where: { userId: senderId } }),
      this.userRepo.findOne({ where: { userId: receiverId } }),
    ]);

    if (!sender || !receiver) {
      throw new NotFoundException('User not found');
    }

    const sortedIds = [senderId, receiverId].sort();
    const existingFriendship = await this.friendshipRepo.findOne({
      where: {
        userOne: { userId: sortedIds[0] },
        userTwo: { userId: sortedIds[1] },
      },
    });

    if (existingFriendship) {
      throw new BadRequestException('Already friends');
    }

    const pending = await this.requestRepo.findOne({
      where: [
        {
          sender: { userId: senderId },
          receiver: { userId: receiverId },
          status: FriendRequestStatus.PENDING,
        },
        {
          sender: { userId: receiverId },
          receiver: { userId: senderId },
          status: FriendRequestStatus.PENDING,
        },
      ],
    });

    if (pending) {
      throw new BadRequestException('Pending request already exists');
    }

    const request = this.requestRepo.create({
      sender,
      receiver,
      status: FriendRequestStatus.PENDING,
      respondedAt: null,
    });

    return this.requestRepo.save(request);
  }

  async getIncoming(userId: string): Promise<FriendRequest[]> {
    return this.requestRepo.find({
      where: {
        receiver: { userId },
        status: FriendRequestStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async acceptRequest(requestId: string, userId: string) {
    const request = await this.requestRepo.findOne({
      where: { requestId },
      relations: ['sender', 'receiver'],
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.receiver.userId !== userId) {
      throw new BadRequestException('Not allowed to accept this request');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    request.status = FriendRequestStatus.ACCEPTED;
    request.respondedAt = new Date();
    await this.requestRepo.save(request);

    const [leftId, rightId] = [
      request.sender.userId,
      request.receiver.userId,
    ].sort();
    const [userOne, userTwo] = await Promise.all([
      this.userRepo.findOne({ where: { userId: leftId } }),
      this.userRepo.findOne({ where: { userId: rightId } }),
    ]);

    if (!userOne || !userTwo) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.friendshipRepo.findOne({
      where: {
        userOne: { userId: leftId },
        userTwo: { userId: rightId },
      },
    });

    if (!existing) {
      await this.friendshipRepo.save(
        this.friendshipRepo.create({
          userOne,
          userTwo,
        }),
      );
    }

    return { success: true };
  }

  async declineRequest(requestId: string, userId: string) {
    const request = await this.requestRepo.findOne({
      where: { requestId },
      relations: ['receiver'],
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.receiver.userId !== userId) {
      throw new BadRequestException('Not allowed to decline this request');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    request.status = FriendRequestStatus.DECLINED;
    request.respondedAt = new Date();
    await this.requestRepo.save(request);

    return { success: true };
  }
}
