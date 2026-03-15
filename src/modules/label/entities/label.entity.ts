// bổ sung - entity mới: nhãn (label) cho task
import { LabelType } from 'src/common/enums/label-type.enum';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Label {
  @PrimaryGeneratedColumn('uuid')
  labelId: string;

  @Column()
  text: string;

  @Column({ default: '#3b82f6' })
  color: string;

  @Column({ type: 'enum', enum: LabelType })
  type: LabelType;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;
}
