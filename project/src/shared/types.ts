import { ParsedComment } from '../content-scripts/domInteractor';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type ActionStatus = '' | 'DONE' | 'FAILED';

export type RunState = 'idle' | 'running' | 'paused' | 'error';

export type CommentType = 'top-level' | 'reply';

export interface ChatMessage {
  role: string;
  content: string;
}

export interface Comment {
  commentId: string;
  text: string;
  ownerProfileUrl: string;
  timestamp: string;
  type: CommentType;
  connected?: boolean;
  threadId: string;
  likeStatus: ActionStatus;
  replyStatus: ActionStatus;
  dmStatus: ActionStatus;
  attempts: {
    like: number;
    reply: number;
    dm: number;
  };
  lastError: string;
  pipeline: {
    queuedAt: string;
    likedAt: string;
    repliedAt: string;
    dmAt: string;
    generatedReply?: string;
    generatedDm?: string;
  };
}

export interface UIState {
  isInitializing: boolean;
  pipelineStatus: RunState;
  stats: {
    totalTopLevelNoReplies: number;
    userTopLevelNoReplies: number;
  };
  comments: Comment[];
  postUrn?: string;
}

export interface Post {
  postId: string;
  postUrl: string;
  lastUpdated: string;
  runState: RunState;
  userProfileUrl?: string;
}

export interface PostState {
  _meta: Post;
  comments: Comment[];
}

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
}

export interface AIConfig {
  provider?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  reply?: {
    customPrompt?: string;
  };
  dm?: {
    customPrompt?: string;
  };
  attribution?: {
    httpReferer?: string;
    xTitle?: string;
  };
  modelFilters?: {
    onlyTextOutput?: boolean;
    minContext: number;
  };
}

export type ExtensionMessage =
  | { type: 'STATE_UPDATE'; payload: Partial<UIState> }
  | { type: 'LOG_ENTRY'; payload: LogEntry }
  | { type: 'ping' }
  | { type: 'START_PIPELINE'; payload: { postUrn: string } }
  | { type: 'STOP_PIPELINE' }
  | { type: 'RESUME_PIPELINE' }
  | { type: 'GET_AI_CONFIG'; payload?: never }
  | { type: 'UPDATE_AI_CONFIG'; payload: Partial<AIConfig> }
  | { type: 'GET_MODELS'; payload?: never }
  | { type: 'REQUEST_POST_STATE_FOR_EXPORT'; payload?: never }
  | { type: 'CAPTURE_POST_STATE'; payload?: never }
  | {
      type: 'PROCESS_CAPTURED_STATE';
      payload: {
        comments: ParsedComment[];
        postUrn: string;
        postUrl: string;
      };
    };