import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_devices')
export class UserDevices {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar' })
  deviceName: string; // e.g., "iPhone 12", "Chrome on Windows"

  @Column({ type: 'varchar' })
  deviceType: string; // mobile, web, tablet

  @Column({ type: 'varchar', nullable: true })
  deviceModel: string;

  @Column({ type: 'varchar', nullable: true })
  osType: string; // iOS, Android, Windows, macOS

  @Column({ type: 'varchar', nullable: true })
  osVersion: string;

  @Column({ type: 'varchar', nullable: true })
  appVersion: string;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text' })
  refreshToken: string;

  @Column({ type: 'varchar', nullable: true })
  fcmToken: string; // Firebase Cloud Messaging Token for push notifications

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}
