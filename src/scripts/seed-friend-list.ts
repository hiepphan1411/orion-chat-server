import { DataSource, In, Repository } from 'typeorm';
import { Conversation } from 'src/modules/conversation/entities/conversation.entity';
import { Admin } from 'src/modules/admin/entities/admin.entity';
import { File } from 'src/modules/file/entities/file.entity';
import {
  FriendRequest,
  FriendRequestStatus,
} from 'src/modules/friend-request/entities/friend-request.entity';
import {
  Friendship,
  FriendshipStatus,
} from 'src/modules/friendship/entities/friendship.entity';
import { GroupConversation } from 'src/modules/group-conversation/entities/group-conversation.entity';
import {
  GroupInvite,
  GroupInviteStatus,
} from 'src/modules/group-invite/entities/group-invite.entity';
import {
  GroupMember,
  GroupMemberRole,
} from 'src/modules/group-member/entities/group-member.entity';
import { Report } from 'src/modules/reports/entities/reports.entity';
import { User } from 'src/modules/users/entities/user.entity';

type SeedUser = {
  key: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  isOnline: boolean;
};

const seedUsers: SeedUser[] = [
  {
    key: 'u1',
    fullName: 'Tran Minh Quan',
    phoneNumber: '0999900011',
    email: 'quan.seed@orion.test',
    isOnline: true,
  },
  {
    key: 'u2',
    fullName: 'Nguyen Linh Chi',
    phoneNumber: '0999900021',
    email: 'linh.seed@orion.test',
    isOnline: true,
  },
  {
    key: 'u3',
    fullName: 'Le Anh Thu',
    phoneNumber: '0999900031',
    email: 'thu.seed@orion.test',
    isOnline: false,
  },
  {
    key: 'u4',
    fullName: 'Pham Huy Hoang',
    phoneNumber: '0999900041',
    email: 'hoang.seed@orion.test',
    isOnline: true,
  },
  {
    key: 'u5',
    fullName: 'Vo Nha Uyen',
    phoneNumber: '0999900051',
    email: 'uyen.seed@orion.test',
    isOnline: false,
  },
  {
    key: 'u6',
    fullName: 'Bui Quoc Khang',
    phoneNumber: '0999900061',
    email: 'khang.seed@orion.test',
    isOnline: true,
  },
];

const FRIEND_PAIRS: Array<[string, string]> = [
  ['u1', 'u2'],
  ['u1', 'u3'],
  ['u1', 'u4'],
  ['u2', 'u5'],
];

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456789',
  database: process.env.DB_NAME || 'orion_chat',
  entities: [
    Admin,
    File,
    User,
    Report,
    Conversation,
    GroupConversation,
    Friendship,
    FriendRequest,
    GroupMember,
    GroupInvite,
  ],
  synchronize: true,
});

async function clearPreviousSeedData(
  userRepo: Repository<User>,
  friendshipRepo: Repository<Friendship>,
  friendRequestRepo: Repository<FriendRequest>,
  groupMemberRepo: Repository<GroupMember>,
  groupInviteRepo: Repository<GroupInvite>,
  groupRepo: Repository<GroupConversation>,
) {
  const seedPhoneNumbers = seedUsers.map((u) => u.phoneNumber);
  const existingUsers = await userRepo.find({
    where: { phoneNumber: In(seedPhoneNumbers) },
  });

  if (!existingUsers.length) return;

  const userIds = existingUsers.map((u) => u.userId);

  await groupInviteRepo.delete([
    { inviter: { userId: In(userIds) } },
    { invitee: { userId: In(userIds) } },
  ]);

  await friendRequestRepo.delete([
    { sender: { userId: In(userIds) } },
    { receiver: { userId: In(userIds) } },
  ]);

  await friendshipRepo.delete([
    { userOne: { userId: In(userIds) } },
    { userTwo: { userId: In(userIds) } },
  ]);

  await groupMemberRepo.delete({ user: { userId: In(userIds) } });

  const seedGroups = await groupRepo.find({
    where: [
      { groupName: 'Orion React Community' },
      { groupName: 'UI Motion Club' },
    ],
  });

  if (seedGroups.length) {
    await groupInviteRepo.delete({
      group: { conversationId: In(seedGroups.map((g) => g.conversationId)) },
    });
    await groupMemberRepo.delete({
      group: { conversationId: In(seedGroups.map((g) => g.conversationId)) },
    });
    await groupRepo.delete(seedGroups.map((g) => g.conversationId));
  }

  await userRepo.delete({ userId: In(userIds) });
}

async function seed() {
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const friendshipRepo = dataSource.getRepository(Friendship);
  const friendRequestRepo = dataSource.getRepository(FriendRequest);
  const groupRepo = dataSource.getRepository(GroupConversation);
  const groupMemberRepo = dataSource.getRepository(GroupMember);
  const groupInviteRepo = dataSource.getRepository(GroupInvite);

  try {
    await clearPreviousSeedData(
      userRepo,
      friendshipRepo,
      friendRequestRepo,
      groupMemberRepo,
      groupInviteRepo,
      groupRepo,
    );

    const passwordHash =
      '$2b$10$EX7Lz0o1YC1xvIzx4ynSMeb2nYzaP6cimczYSXLsPr/0VOCjJ278.';

    const userMap: Record<string, User> = {};
    for (const seedUser of seedUsers) {
      const user = userRepo.create({
        phoneNumber: seedUser.phoneNumber,
        fullName: seedUser.fullName,
        email: seedUser.email,
        passwordHash,
        isOnline: seedUser.isOnline,
      });
      userMap[seedUser.key] = await userRepo.save(user);
    }

    for (const [left, right] of FRIEND_PAIRS) {
      const [a, b] = [userMap[left], userMap[right]].sort((x, y) =>
        x.userId.localeCompare(y.userId),
      );
      const friendship = friendshipRepo.create({
        userOne: a,
        userTwo: b,
        status: FriendshipStatus.ACTIVE,
      });
      await friendshipRepo.save(friendship);
    }

    await friendRequestRepo.save([
      friendRequestRepo.create({
        sender: userMap.u5,
        receiver: userMap.u1,
        status: FriendRequestStatus.PENDING,
        respondedAt: null,
      }),
      friendRequestRepo.create({
        sender: userMap.u6,
        receiver: userMap.u1,
        status: FriendRequestStatus.PENDING,
        respondedAt: null,
      }),
      friendRequestRepo.create({
        sender: userMap.u3,
        receiver: userMap.u2,
        status: FriendRequestStatus.DECLINED,
        respondedAt: new Date(),
      }),
    ]);

    const group1 = await groupRepo.save(
      groupRepo.create({
        groupName: 'Orion React Community',
        groupAvatar: 'https://picsum.photos/seed/orion-react/200/200',
        createdAt: new Date(),
        lastMessageId: 'seed-msg-001',
      }),
    );

    const group2 = await groupRepo.save(
      groupRepo.create({
        groupName: 'UI Motion Club',
        groupAvatar: 'https://picsum.photos/seed/ui-motion/200/200',
        createdAt: new Date(),
        lastMessageId: 'seed-msg-002',
      }),
    );

    await groupMemberRepo.save([
      groupMemberRepo.create({
        group: group1,
        user: userMap.u2,
        role: GroupMemberRole.OWNER,
      }),
      groupMemberRepo.create({
        group: group1,
        user: userMap.u3,
        role: GroupMemberRole.MEMBER,
      }),
      groupMemberRepo.create({
        group: group2,
        user: userMap.u4,
        role: GroupMemberRole.OWNER,
      }),
      groupMemberRepo.create({
        group: group2,
        user: userMap.u5,
        role: GroupMemberRole.MEMBER,
      }),
    ]);

    await groupInviteRepo.save([
      groupInviteRepo.create({
        group: group1,
        inviter: userMap.u2,
        invitee: userMap.u1,
        status: GroupInviteStatus.PENDING,
        respondedAt: null,
      }),
      groupInviteRepo.create({
        group: group2,
        inviter: userMap.u4,
        invitee: userMap.u1,
        status: GroupInviteStatus.PENDING,
        respondedAt: null,
      }),
      groupInviteRepo.create({
        group: group2,
        inviter: userMap.u4,
        invitee: userMap.u3,
        status: GroupInviteStatus.DECLINED,
        respondedAt: new Date(),
      }),
    ]);

    console.log('Friend List seed data created successfully.');
    console.table(
      Object.entries(userMap).map(([key, user]) => ({
        key,
        userId: user.userId,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        isOnline: user.isOnline,
      })),
    );
    console.table([
      {
        key: 'group1',
        groupId: group1.conversationId,
        groupName: group1.groupName,
      },
      {
        key: 'group2',
        groupId: group2.conversationId,
        groupName: group2.groupName,
      },
    ]);
    console.log('Test user (for incoming):', {
      userId: userMap.u1.userId,
      phone: '0999900011',
      password: 'N/A (seed uses placeholder hash)',
      name: userMap.u1.fullName,
    });
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error('Failed to seed Friend List data:', error);
  process.exit(1);
});
