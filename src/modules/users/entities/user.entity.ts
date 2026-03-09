import { File } from 'src/modules/file/entities/file.entity';
import { Report } from 'src/modules/reports/entities/reports.entity';

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  userId: string;

  @Column({ unique: true })
  phoneNumber: string;

  @Column()
  passwordHash: string;

  @Column()
  fullName: string;

  @Column({ nullable: true })
  birthDate: Date;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  coverImage: string;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ default: true })
  showOnlineStatus: boolean;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => File)
  fileUser: File;

  @OneToMany(() => Report, (report) => report.user)
  reports: Report[];

  @CreateDateColumn()
  createdAt: Date;
}

//Map quan hệ nếu có
//   @OneToMany(() => Message, (message) => message.user)
//   messages: Message[];
