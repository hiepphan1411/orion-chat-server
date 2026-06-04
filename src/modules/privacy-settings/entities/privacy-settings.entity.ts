import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('privacy_settings')
@Unique(['userId'])
export class PrivacySettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  userId: string;

  // Profile Visibility
  @Column({ type: 'varchar', default: 'friends' })
  profileVisibility: string; // public, friends, private

  // Message Permissions
  @Column({ type: 'varchar', default: 'friends' })
  messagePermission: string; // everyone, friends, none

  // Last Seen Visibility
  @Column({ type: 'boolean', default: true })
  lastSeenVisibility: boolean;

  // Online Status Visibility
  @Column({ type: 'boolean', default: true })
  onlineStatusVisibility: boolean;

  // AI/Security Related
  @Column({ type: 'boolean', default: false })
  allowAIToSeeProfile: boolean; // AI có thể nhìn thấy profile

  @Column({ type: 'boolean', default: false })
  allowAIToSeeMessages: boolean; // AI có thể nhìn thấy tin nhắn

  @Column({ type: 'boolean', default: false })
  allowAIToSeeMedia: boolean; // AI có thể nhìn thấy ảnh/video

  // Call & Media Sharing
  @Column({ type: 'varchar', default: 'friends' })
  callPermission: string; // everyone, friends, none

  @Column({ type: 'boolean', default: true })
  allowScreenSharing: boolean;

  // Data Collection
  @Column({ type: 'boolean', default: false })
  allowDataCollection: boolean; // Cho phép thu thập dữ liệu

  @Column({ type: 'boolean', default: false })
  allowAnalytics: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
