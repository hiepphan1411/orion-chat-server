import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
//Để test
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;
  //Map quan hệ nếu có
  //   @OneToMany(() => Message, (message) => message.user)
  //   messages: Message[];
}
