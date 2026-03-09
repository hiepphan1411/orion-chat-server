import { Conversation } from 'src/modules/conversation/entities/conversation.entity';
import { ChildEntity, Column } from 'typeorm';

@ChildEntity()
export class GroupConversation extends Conversation {
  @Column()
  groupName: string;

  @Column()
  groupAvatar: string;
}
