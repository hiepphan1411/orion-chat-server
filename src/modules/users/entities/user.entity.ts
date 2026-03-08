import { File } from 'src/modules/file/entities/file.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

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
}

//Map quan hệ nếu có
//   @OneToMany(() => Message, (message) => message.user)
//   messages: Message[];
