import { Conversation } from 'src/modules/conversation/entities/conversation.schema';
import { ChildEntity } from 'typeorm';

@ChildEntity()
export class PrivateConversation extends Conversation {}
