import { DataSource } from 'typeorm';
import bcrypt from 'bcrypt';
import { User } from 'src/modules/users/entities/user.entity';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456789',
  database: process.env.DB_NAME || 'orion_chat',
  entities: ['src/modules/**/*.entity.ts', 'src/modules/**/*.entity.js'],
  synchronize: true,
});

const seedUser = {
  phoneNumber: '0900000001',
  fullName: 'Demo Profile User',
  email: 'profile.demo@orion.test',
  gender: 'male',
  password: 'Orion@123',
};

async function seed() {
  await dataSource.initialize();

  try {
    const userRepo = dataSource.getRepository(User);

    const existing = await userRepo.findOne({
      where: [{ phoneNumber: seedUser.phoneNumber }, { email: seedUser.email }],
    });

    const passwordHash = await bcrypt.hash(seedUser.password, 10);

    if (existing) {
      existing.fullName = seedUser.fullName;
      existing.gender = seedUser.gender;
      existing.passwordHash = passwordHash;
      existing.isActive = true;

      const updated = await userRepo.save(existing);

      console.log('Updated demo user for profile API testing:');
      console.table([
        {
          userId: updated.userId,
          phoneNumber: updated.phoneNumber,
          fullName: updated.fullName,
          email: updated.email,
        },
      ]);
    } else {
      const created = await userRepo.save(
        userRepo.create({
          phoneNumber: seedUser.phoneNumber,
          fullName: seedUser.fullName,
          email: seedUser.email,
          gender: seedUser.gender,
          passwordHash,
          isActive: true,
        }),
      );

      console.log('Created demo user for profile API testing:');
      console.table([
        {
          userId: created.userId,
          phoneNumber: created.phoneNumber,
          fullName: created.fullName,
          email: created.email,
        },
      ]);
    }

    console.log('Login credentials:');
    console.table([
      {
        phoneNumber: seedUser.phoneNumber,
        password: seedUser.password,
      },
    ]);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error) => {
  console.error('Failed to seed demo profile user:', error);
  process.exit(1);
});
