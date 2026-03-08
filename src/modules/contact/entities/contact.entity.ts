import { User } from 'src/modules/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  phoneNumber: string;

  @Column()
  name: string;

  @Column({ default: false })
  isBlocked: boolean;

  // User 1 - N Contact
  @ManyToOne(() => User)
  user: User;
}
