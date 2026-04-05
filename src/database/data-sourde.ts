import { DataSource } from 'typeorm';

import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '123456789',
        database: process.env.DB_NAME || 'orion_chat',
      }),
  entities: ['dist/**/*.entity.js'],
  synchronize: true,
});
