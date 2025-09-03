export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// Corrected: timestamp is a string (ISO format) from new Date().toISOString()
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type ActionStatus = '' | 'DONE' | 'FAILED';

// New: Exported RunState for reuse in PostState, UIState, etc.
export type RunState = 'idle' | 'running' | 'paused' | 'error';

// New: Exported CommentType for reuse and clarity.
export type CommentType = 'top-level' | 'reply';

// New: Exported ChatMessage for AI client interactions.
export interface ChatMessage {
  role: string;
  content: string;
}

// Updated: Comment interface with corrected types and additional pipeline properties.
export interface Comment {
  commentId: string;
  text: string;
  ownerProfileUrl: string;
  timestamp: string;
  type: CommentType; // Using the new CommentType alias.
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
    // Added optional properties based on pipelineManager usage.
    generatedReply?: string;
    generatedDm?: string;
  };
}

// Updated: UIState now uses the exported RunState type.
export interface UIState {
  isInitializing: boolean;
  pipelineStatus: RunState;
  stats: {
    totalTopLevelNoReplies: number;
    userTopLevelNoReplies: number;
  };
  comments: Comment[];
}

// New: Exported Post interface to represent post metadata.
export interface Post {
  postId: string;
  postUrl: string;
  lastUpdated: string;
  runState: RunState;
}

// Refactored: PostState structure is now valid, clear, and uses the Post interface.
export interface PostState {
  _meta: Post;
  comments: Comment[];
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
  | { type: 'START_PIPELINE'; payload: { postUrn: string } }
  | { type: 'STOP_PIPELINE' }
  | { type: 'RESUME_PIPELINE' }
  | { type: 'GET_AI_CONFIG'; payload?: never }
  | { type: 'UPDATE_AI_CONFIG'; payload: Partial<AIConfig> }
  | { type: 'GET_MODELS'; payload?: never }
  | { type: 'REQUEST_POST_STATE_FOR_EXPORT'; payload?: never };