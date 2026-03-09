import { Conversation } from 'src/modules/conversation/entities/conversation.entity';
import { ChildEntity } from 'typeorm';

@ChildEntity()
export class PrivateConversation extends Conversation {}
