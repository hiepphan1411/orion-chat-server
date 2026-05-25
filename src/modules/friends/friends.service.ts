import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Friendship,
  FriendshipStatus,
} from '../friendship/entities/friendship.entity';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepo: Repository<GroupMember>,
  ) {}

  private getSortedPair(userId: string, friendId: string): [string, string] {
    return [userId, friendId].sort() as [string, string];
  }

  private async findFriendshipRecord(userId: string, friendId: string) {
    const [leftId, rightId] = this.getSortedPair(userId, friendId);
    return this.friendshipRepo.findOne({
      where: {
        userOne: { userId: leftId },
        userTwo: { userId: rightId },
      },
      relations: ['userOne', 'userTwo'],
    });
  }

  private async getFriendIdSet(userId: string): Promise<Set<string>> {
    const rows = await this.friendshipRepo.find({
      where: [
        { userOne: { userId }, status: FriendshipStatus.ACTIVE },
        { userTwo: { userId }, status: FriendshipStatus.ACTIVE },
      ],
      relations: ['userOne', 'userTwo'],
    });

    return new Set(
      rows.map((row) =>
        row.userOne.userId === userId ? row.userTwo.userId : row.userOne.userId,
      ),
    );
  }

  private async getBlockedIdSet(userId: string): Promise<Set<string>> {
    const rows = await this.friendshipRepo.find({
      where: [
        { userOne: { userId }, status: FriendshipStatus.BLOCKED },
        { userTwo: { userId }, status: FriendshipStatus.BLOCKED },
      ],
      relations: ['userOne', 'userTwo'],
    });

    return new Set(
      rows.map((row) =>
        row.userOne.userId === userId ? row.userTwo.userId : row.userOne.userId,
      ),
    );
  }

  async getFriends(userId: string) {
    const rows = await this.friendshipRepo.find({
      where: [
        { userOne: { userId }, status: FriendshipStatus.ACTIVE },
        { userTwo: { userId }, status: FriendshipStatus.ACTIVE },
      ],
      relations: ['userOne', 'userTwo'],
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => {
      const other = row.userOne.userId === userId ? row.userTwo : row.userOne;
      return {
        id: other.userId,
        fullName: other.fullName,
        avatarUrl: other.avatarUrl,
        isOnline: other.isOnline,
        createdAt: row.createdAt,
      };
    });
  }

  async searchUsers(userId: string, query: string) {
    const keyword = query.trim();
    if (!keyword) return [];

    const [friendIds, blockedIds] = await Promise.all([
      this.getFriendIdSet(userId),
      this.getBlockedIdSet(userId),
    ]);

    const users = await this.userRepo
      .createQueryBuilder('user')
      .where('user.userId != :userId', { userId })
      .andWhere('user.phoneNumber = :phone', { phone: keyword })
      .orderBy('user.isOnline', 'DESC')
      .addOrderBy('user.fullName', 'ASC')
      .take(5)
      .getMany();

    return users
      .filter(
        (user) =>
          !friendIds.has(user.userId) && !blockedIds.has(user.userId),
      )
      .map((user) => ({
        id: user.userId,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        avatarUrl: user.avatarUrl,
        isOnline: user.isOnline,
      }));
  }

  async getSuggestedByMutualGroups(userId: string) {
    const friendIds = await this.getFriendIdSet(userId);

    const myMemberships = await this.groupMemberRepo.find({
      where: { user: { userId } },
      relations: ['group'],
    });

    const groupIds = myMemberships.map((m) => m.group.conversationId);
    if (!groupIds.length) return [];

    const members = await this.groupMemberRepo.find({
      where: { group: { conversationId: In(groupIds) } },
      relations: ['group', 'user'],
    });

    const counter = new Map<
      string,
      {
        user: User;
        groupNames: Set<string>;
      }
    >();

    for (const member of members) {
      const uid = member.user.userId;
      if (uid === userId || friendIds.has(uid)) continue;

      const existing = counter.get(uid);
      if (existing) {
        existing.groupNames.add(member.group.groupName);
      } else {
        counter.set(uid, {
          user: member.user,
          groupNames: new Set([member.group.groupName]),
        });
      }
    }

    return Array.from(counter.values())
      .sort((a, b) => b.groupNames.size - a.groupNames.size)
      .slice(0, 12)
      .map((item) => ({
        id: item.user.userId,
        fullName: item.user.fullName,
        avatarUrl: item.user.avatarUrl,
        isOnline: item.user.isOnline,
        mutualGroupCount: item.groupNames.size,
        mutualGroupNames: Array.from(item.groupNames),
      }));
  }

  async getRecentlyActive(userId: string) {
    const rows = await this.friendshipRepo.find({
      where: [
        { userOne: { userId }, status: FriendshipStatus.ACTIVE },
        { userTwo: { userId }, status: FriendshipStatus.ACTIVE },
      ],
      relations: ['userOne', 'userTwo'],
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return rows
      .map((row) => {
        const other = row.userOne.userId === userId ? row.userTwo : row.userOne;
        return {
          id: other.userId,
          fullName: other.fullName,
          avatarUrl: other.avatarUrl,
          isOnline: other.isOnline,
          createdAt: row.createdAt,
        };
      })
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline))
      .slice(0, 10);
  }

  async getBlockedFriends(userId: string) {
    const rows = await this.friendshipRepo.find({
      where: [
        { userOne: { userId }, status: FriendshipStatus.BLOCKED },
        { userTwo: { userId }, status: FriendshipStatus.BLOCKED },
      ],
      relations: ['userOne', 'userTwo'],
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => {
      const other = row.userOne.userId === userId ? row.userTwo : row.userOne;
      return {
        id: other.userId,
        fullName: other.fullName,
        avatarUrl: other.avatarUrl,
        isOnline: other.isOnline,
        blockedAt: row.createdAt,
      };
    });
  }

  /**
   * Lấy chi tiết profile của một bạn bè
   *
   * Kiểm tra:
   * - userId và friendId có tồn tại không
   * - Họ có phải bạn bè không
   * - Return thông tin chi tiết của bạn bè
   */
  async getFriendProfile(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Invalid friend identifier');
    }

    const friendship = await this.findFriendshipRecord(userId, friendId);
    if (!friendship || friendship.status !== FriendshipStatus.ACTIVE) {
      throw new NotFoundException('Friendship not found');
    }

    const friend =
      friendship.userOne.userId === userId
        ? friendship.userTwo
        : friendship.userOne;

    return {
      id: friend.userId,
      fullName: friend.fullName,
      phoneNumber: friend.phoneNumber,
      email: friend.email,
      avatarUrl: friend.avatarUrl,
      coverImage: friend.coverImage,
      gender: friend.gender,
      birthDate: friend.birthDate,
      createdAt: friend.createdAt,
      isOnline: friend.isOnline,
      friendshipSince: friendship.createdAt,
    };
  }

  async removeFriend(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Invalid friend identifier');
    }

    const friendship = await this.findFriendshipRecord(userId, friendId);
    if (!friendship || friendship.status !== FriendshipStatus.ACTIVE) {
      throw new NotFoundException('Friendship not found');
    }

    await this.friendshipRepo.remove(friendship);

    return {
      success: true,
      message: 'Friend removed successfully',
    };
  }

  async blockFriend(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Invalid friend identifier');
    }

    const [leftId, rightId] = this.getSortedPair(userId, friendId);
    const [userOne, userTwo] = await Promise.all([
      this.userRepo.findOne({ where: { userId: leftId } }),
      this.userRepo.findOne({ where: { userId: rightId } }),
    ]);

    if (!userOne || !userTwo) {
      throw new NotFoundException('User not found');
    }

    const friendship = await this.findFriendshipRecord(userId, friendId);

    if (!friendship) {
      const blocked = this.friendshipRepo.create({
        userOne,
        userTwo,
        status: FriendshipStatus.BLOCKED,
      });
      await this.friendshipRepo.save(blocked);
    } else if (friendship.status !== FriendshipStatus.BLOCKED) {
      friendship.status = FriendshipStatus.BLOCKED;
      await this.friendshipRepo.save(friendship);
    }

    return {
      success: true,
      message: 'User blocked successfully',
    };
  }

  async unblockFriend(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Invalid friend identifier');
    }

    const friendship = await this.findFriendshipRecord(userId, friendId);
    if (!friendship || friendship.status !== FriendshipStatus.BLOCKED) {
      throw new NotFoundException('Blocked relationship not found');
    }

    await this.friendshipRepo.remove(friendship);

    return {
      success: true,
      message: 'User unblocked successfully',
    };
  }
}
