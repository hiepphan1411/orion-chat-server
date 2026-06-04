import { ReasonCode } from 'src/common/enums/reason-code.enum';
import { ReportStatus } from 'src/common/enums/report-status.enum';
import { ReportType } from 'src/common/enums/report-type.enum';
import { Admin } from 'src/modules/admin/entities/admin.entity';
import { Conversation } from 'src/modules/conversation/entities/conversation.schema';
import { User } from 'src/modules/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Report {
  @PrimaryGeneratedColumn('uuid')
  reportId: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  creatAt: Date;

  @Column({ nullable: true })
  handleAt: Date;

  @Column({
    type: 'enum',
    enum: ReportStatus,
  })
  status: ReportStatus;

  @Column({
    type: 'enum',
    enum: ReportType,
  })
  type: ReportType;

  @Column({
    type: 'enum',
    enum: ReasonCode,
  })
  reasonCode: ReasonCode;

  @ManyToOne(() => User, (user) => user.reports)
  user: User;

  @ManyToOne(() => Admin, (admin) => admin.reports)
  admin: Admin;

  @ManyToOne(() => Conversation, (conversation) => conversation.reports)
  conversation: Conversation;
}
