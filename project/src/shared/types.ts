export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type ActionStatus = '' | 'DONE' | 'FAILED';

export interface Comment {
  commentId: string;
  text: string;
  ownerProfileUrl: string;
  timestamp: string;
  type: 'top-level' | 'reply';
  connected: boolean;
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
  };
}

export interface UIState {
  isInitializing: boolean;
  pipelineStatus: 'idle' | 'running' | 'paused' | 'error';
  stats: {
    totalTopLevelNoReplies: number;
    userTopLevelNoReplies: number;
  };
  comments: Comment[];
}

export interface PostState {
  [postUrl: string]: Comment[];
  _meta: {
    postId: string;
    lastUpdated: string;
    runState: 'idle' | 'running' | 'paused' | 'error';
  };
}

export interface OpenRouterModel {
    id: string;
    name: string;
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
      minContext?: number;
    };
}

export type ExtensionMessage =
  | { type: 'STATE_UPDATE'; payload: Partial<UIState> }
  | { type: 'LOG_ENTRY'; payload: LogEntry }
  | { type: 'ping' }
  | { type: 'START_PIPELINE', payload: { postUrn: string } }
  | { type: 'STOP_PIPELINE' }
  | { type: 'RESUME_PIPELINE' }
  | { type: 'GET_AI_CONFIG', payload?: never }
  | { type: 'UPDATE_AI_CONFIG', payload: Partial<AIConfig> }
  | { type: 'GET_MODELS', payload?: never }
  | { type: 'REQUEST_POST_STATE_FOR_EXPORT', payload?: never };