import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { User } from 'src/modules/users/entities/user.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class CalendarEvent {
  @PrimaryGeneratedColumn('uuid')
  eventId: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  startTime: Date;

  @Column()
  endTime: Date;

  @Column()
  createdAt: Date;

  @Column()
  color: string;

  @Column()
  location: string;

  @ManyToOne(() => Workspace)
  workspace: Workspace;
}
