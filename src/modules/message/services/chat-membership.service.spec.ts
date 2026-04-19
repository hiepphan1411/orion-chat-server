import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatMembershipService } from './chat-membership.service';
import { ConversationType } from 'src/modules/conversation/entities/conversation.schema';

describe('ChatMembershipService', () => {
  const conversationRepo = {
    findOne: jest.fn(),
  };

  const participantRepo = {
    findOne: jest.fn(),
  };

  let service: ChatMembershipService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatMembershipService(
      conversationRepo as any,
      participantRepo as any,
    );
  });

  it('should allow member access to group conversation', async () => {
    conversationRepo.findOne.mockResolvedValue({
      conversationId: 'conv-1',
      type: ConversationType.GROUP,
    });
    participantRepo.findOne.mockResolvedValue({
      conversationId: 'conv-1',
      userId: 'user-1',
    });

    const result = await service.assertConversationMember('user-1', 'conv-1');

    expect(result).toEqual({
      conversationId: 'conv-1',
      type: ConversationType.GROUP,
    });
  });

  it('should reject when conversation does not exist', async () => {
    conversationRepo.findOne.mockResolvedValue(null);

    await expect(
      service.assertConversationMember('user-1', 'conv-missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject when user is not member', async () => {
    conversationRepo.findOne.mockResolvedValue({
      conversationId: 'conv-1',
      type: ConversationType.GROUP,
    });
    participantRepo.findOne.mockResolvedValue(null);

    await expect(
      service.assertConversationMember('user-2', 'conv-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
