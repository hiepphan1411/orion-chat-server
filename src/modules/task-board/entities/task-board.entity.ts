import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class TaskBoard {
  @PrimaryGeneratedColumn('uuid')
  boardId: string;

  @Column()
  boardName: string;

  @Column()
  backgroundColor: string;

  @Column()
  createdAt: Date;

  @ManyToOne(() => Workspace)
  workspace: Workspace;
}
