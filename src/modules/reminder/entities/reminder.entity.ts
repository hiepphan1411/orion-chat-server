import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { CalendarEvent } from 'src/modules/calendar-event/entities/calendar-event.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  reminderId: string;

  @Column()
  minutesBefore: number;

  //TODO: Chổ này xem lại sơ đồ entity
  @ManyToOne(() => CalendarEvent)
  event: CalendarEvent;
}
