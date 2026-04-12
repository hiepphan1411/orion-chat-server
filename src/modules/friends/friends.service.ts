import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Friendship } from '../friendship/entities/friendship.entity';
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

  private async getFriendIdSet(userId: string): Promise<Set<string>> {
    const rows = await this.friendshipRepo.find({
      where: [{ userOne: { userId } }, { userTwo: { userId } }],
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
      where: [{ userOne: { userId } }, { userTwo: { userId } }],
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

    const friendIds = await this.getFriendIdSet(userId);

    const users = await this.userRepo
      .createQueryBuilder('user')
      .where('user.userId != :userId', { userId })
      .andWhere(
        '(user.fullName ILIKE :keyword OR user.phoneNumber ILIKE :keyword)',
        {
          keyword: `%${keyword}%`,
        },
      )
      .orderBy('user.isOnline', 'DESC')
      .addOrderBy('user.fullName', 'ASC')
      .take(10)
      .getMany();

    return users
      .filter((user) => !friendIds.has(user.userId))
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
      where: [{ userOne: { userId } }, { userTwo: { userId } }],
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

  /**
   * Lấy chi tiết profile của một bạn bè
   *
   * Kiểm tra:
   * - userId và friendId có tồn tại không
   * - Họ có phải bạn bè không
   * - Return thông tin chi tiết của bạn bè
   */
  async getFriendProfile(userId: string, friendId: string) {
    // Kiểm tra xem freelancerId có tồn tại không
    const friend = await this.userRepo.findOne({
      where: { userId: friendId },
    });

    if (!friend) {
      throw new Error(`Khong tim thay ban be: ${friendId}`);
    }

    // Kiểm tra xem họ có phải bạn bè không
    const friendship = await this.friendshipRepo.findOne({
      where: [
        { userOne: { userId }, userTwo: { userId: friendId } },
        { userOne: { userId: friendId }, userTwo: { userId } },
      ],
    });

    if (!friendship) {
      throw new Error(`${friendId} khong phai ban be`);
    }

    // Return thông tin chi tiết
    return {
      id: friend.userId,
      fullName: friend.fullName,
      phoneNumber: friend.phoneNumber,
      email: friend.email,
      avatarUrl: friend.avatarUrl,
      coverImage: friend.coverImage,
      gender: friend.gender,
      birthDate: friend.birthDate,
      isOnline: friend.isOnline,
      createdAt: friend.createdAt,
      friendshipSince: friendship.createdAt,
    };
  }

  /**
   * Lấy danh sách bạn bè bị chặn (người dùng hiện tại chặn)
   * TODO:
   */
  async getBlockedFriends(userId: string) {
    // TODO: Khi có bảng Blocked, query từ bảng đó
    // Hiện tại chỉ có blocking ở cấp conversation
    return [];
  }
}
