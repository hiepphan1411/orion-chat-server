import { User } from 'src/modules/users/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

@Entity()
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  sessionId: string;

  @Column()
  accessToken: string;

  @Column()
  refreshToken: string;

  @Column()
  deviceInfo: string;

  @Column()
  ipAddress: string;

  @Column()
  loginAt: Date;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  isRevoked: boolean;

  //User 1 - N UserSessionnnnn
  @ManyToOne(() => User)
  user: User;
}
