import { File } from 'src/modules/file/entities/file.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  workspaceId: string;

  @Column()
  workspaceName: string;

  @Column()
  description: string;

  @Column()
  avatarUrl: string;

  @Column()
  createdAt: Date;

  @Column()
  memberLimit: number;

  @ManyToOne(() => File)
  fileUser: File;
}
