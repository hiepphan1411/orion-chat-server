import { TypeChannel } from 'src/common/enums/type-channel.enum';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  channelId: string;

  @Column()
  channelName: string;

  @Column()
  description: string;

  @Column({
    type: 'enum',
    enum: TypeChannel,
  })
  type: TypeChannel;

  @Column({ default: false })
  isPrivate: boolean;

  @Column()
  createdAt: Date;

  @ManyToOne(() => Workspace)
  workspace: Workspace;
}
