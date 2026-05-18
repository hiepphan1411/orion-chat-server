export type AIActionType =
  | 'create_task'
  | 'summarize_unread'
  | 'schedule_meeting'
  | 'update_task'
  | 'set_priority'
  | 'follow_up';

export interface AIActionSuggestion {
  id: string;
  type: AIActionType;
  title: string;
  description: string;
  payload?: Record<string, unknown>;
  requiresApproval: boolean;
  requiredFields?: string[];
}

export interface AIActionExecutionResult {
  status: 'executed' | 'rejected' | 'needs_input';
  message?: string;
  requiredFields?: string[];
  data?: unknown;
}
