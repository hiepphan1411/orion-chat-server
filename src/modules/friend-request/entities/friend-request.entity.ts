import { User } from 'src/modules/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class FriendRequest {
  @PrimaryGeneratedColumn('uuid')
  requestId: string;

  @Column()
  status: string;

  @Column()
  createdAt: Date;

  @ManyToOne(() => User)
  sender: User;

  @ManyToOne(() => User)
  receiver: User;
}
