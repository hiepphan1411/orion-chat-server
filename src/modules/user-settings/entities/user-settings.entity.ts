import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('user_settings')
@Unique(['userId'])
export class UserSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  userId: string;

  // Appearance Settings
  @Column({ type: 'varchar', nullable: true, default: 'light' })
  theme: string; // light, dark, auto

  @Column({ type: 'int', nullable: true, default: 16 })
  fontSize: number; // 12-24

  @Column({ type: 'text', nullable: true })
  wallpaper: string; // URL or color

  // Additional Appearance
  @Column({ type: 'varchar', nullable: true })
  fontFamily: string;

  @Column({ type: 'varchar', nullable: true })
  accentColor: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
