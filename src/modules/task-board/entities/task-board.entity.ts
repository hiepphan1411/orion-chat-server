import { BoardColumn } from 'src/modules/board-column/entities/board-column.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class TaskBoard {
  @PrimaryGeneratedColumn('uuid')
  boardId: string;

  @Column()
  boardName: string;

  // bổ sung - mô tả board
  @Column({ nullable: true })
  description: string;

  @Column({ default: '#0d9488' })
  backgroundColor: string;

  // bổ sung - icon của board (tên icon FontAwesome)
  @Column({ default: 'fa-clipboard-list' })
  icon: string;

  @CreateDateColumn()
  createdAt: Date;

  // bổ sung - ngày cập nhật cuối
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Workspace, (workspace) => workspace.boards, {
    onDelete: 'CASCADE',
  })
  workspace: Workspace;

  // bổ sung - danh sách columns (inverse relation)
  @OneToMany(() => BoardColumn, (col) => col.board, { cascade: true })
  columns: BoardColumn[];
}
