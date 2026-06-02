import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Friendship,
  FriendshipStatus,
} from '../friendship/entities/friendship.entity';
import { PrivacySettingsService } from './privacy-settings.service';
import {
  ContactPermission,
  normalizeContactPermission,
  normalizeProfileVisibility,
  ProfileVisibility,
  ViewerRelationship,
} from './privacy-settings.constants';

@Injectable()
export class PrivacyPolicyService {
  constructor(
    private readonly privacySettingsService: PrivacySettingsService,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
  ) {}

  private getSortedPair(userId: string, otherUserId: string): [string, string] {
    return [userId, otherUserId].sort() as [string, string];
  }

  async getRelationship(
    viewerId: string,
    targetUserId: string,
  ): Promise<ViewerRelationship> {
    if (viewerId === targetUserId) {
      return 'self';
    }

    const [leftId, rightId] = this.getSortedPair(viewerId, targetUserId);
    const friendship = await this.friendshipRepo.findOne({
      where: {
        userOne: { userId: leftId },
        userTwo: { userId: rightId },
      },
    });

    if (!friendship) {
      return 'stranger';
    }

    if (friendship.status === FriendshipStatus.BLOCKED) {
      return 'blocked';
    }

    if (friendship.status === FriendshipStatus.ACTIVE) {
      return 'friend';
    }

    return 'stranger';
  }

  async assertNotBlocked(viewerId: string, targetUserId: string) {
    const [leftId, rightId] = this.getSortedPair(viewerId, targetUserId);
    const blockedFriendship = await this.friendshipRepo.findOne({
      where: {
        userOne: { userId: leftId },
        userTwo: { userId: rightId },
        status: FriendshipStatus.BLOCKED,
      },
    });

    if (!blockedFriendship) {
      return;
    }

    if (blockedFriendship.blockedByUserId === viewerId) {
      throw new ForbiddenException(
        'You blocked this user. Unblock to continue.',
      );
    }

    throw new ForbiddenException('This user is not available to you.');
  }

  async canViewFullProfile(
    viewerId: string,
    targetUserId: string,
  ): Promise<boolean> {
    const relationship = await this.getRelationship(viewerId, targetUserId);
    if (relationship === 'self') {
      return true;
    }
    if (relationship === 'blocked') {
      return false;
    }

    const settings =
      await this.privacySettingsService.findByUserId(targetUserId);
    const visibility = normalizeProfileVisibility(settings.profileVisibility);

    if (visibility === ProfileVisibility.PUBLIC) {
      return true;
    }

    if (visibility === ProfileVisibility.FRIENDS) {
      return relationship === 'friend';
    }

    return false;
  }

  async assertCanMessage(senderId: string, receiverId: string) {
    await this.assertContactAllowed(
      senderId,
      receiverId,
      'messagePermission',
      'MESSAGE_NOT_ALLOWED',
    );
  }

  async assertCanCall(callerId: string, receiverId: string) {
    await this.assertContactAllowed(
      callerId,
      receiverId,
      'callPermission',
      'CALL_NOT_ALLOWED',
    );
  }

  private async assertContactAllowed(
    actorId: string,
    targetUserId: string,
    field: 'messagePermission' | 'callPermission',
    code: string,
  ) {
    if (actorId === targetUserId) {
      return;
    }

    const relationship = await this.getRelationship(actorId, targetUserId);
    if (relationship === 'blocked') {
      throw new ForbiddenException({
        code,
        message: 'This user is not available to you.',
      });
    }

    const settings =
      await this.privacySettingsService.findByUserId(targetUserId);
    const permission = normalizeContactPermission(settings[field]);

    if (permission === ContactPermission.EVERYONE) {
      return;
    }

    if (permission === ContactPermission.FRIENDS && relationship === 'friend') {
      return;
    }

    throw new ForbiddenException({
      code,
      message:
        field === 'messagePermission'
          ? 'This user is not accepting messages from you.'
          : 'This user is not accepting calls from you.',
    });
  }
}
