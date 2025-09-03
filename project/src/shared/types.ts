/**
 * Represents the overall processing state of a post.
 */
export type RunState = 'idle' | 'running' | 'paused' | 'error';

/**
 * Represents the type of a comment.
 */
export type CommentType = 'top-level' | 'reply';

/**
 * Represents the status of a pipeline action (Like, Reply, DM).
 */
export type ActionStatus = '' | 'DONE' | 'FAILED';

/**
 * Tracks the number of attempts for each action.
 */
export interface Attempts {
  like: number;
  reply: number;
  dm: number;
}

/**
 * Timestamps for key events in the processing pipeline for a comment.
 */
export interface PipelineTimestamps {
  queuedAt: string;
  likedAt: string;
  repliedAt: string;
  dmAt: string;
}

/**
 * Represents a single comment and its processing state.
 */
export interface Comment {
  commentId: string;
  text: string;
  ownerProfileUrl: string;
  timestamp: string;
  type: CommentType;
  connected: boolean;
  threadId: string;
  likeStatus: ActionStatus;
  replyStatus: ActionStatus;
  dmStatus: ActionStatus;
  lastError: string;
  attempts: Attempts;
  pipeline: PipelineTimestamps;
}

/**
 * Represents the metadata for a post being processed.
 */
export interface Post {
  postId: string; // The URN
  postUrl: string;
  lastUpdated: string;
  runState: RunState;
}

/**
 * Represents the entire state object for a single post.
 * This is the in-memory representation, which is then transformed for storage.
 */
export interface PostState {
  _meta: Post;
  comments: Comment[];
}

/**
 * Represents a model from the OpenRouter API.
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
}

/**
 * Configuration for AI-generated replies.
 */
export interface ReplyConfig {
  customPrompt: string;
}

/**
 * Configuration for AI-generated direct messages.
 */
export interface DmConfig {
  customPrompt: string;
}

/**
 * Attribution headers for OpenRouter API calls.
 */
export interface AttributionConfig {
  httpReferer: string;
  xTitle: string;
}

/**
 * Filters for selecting an AI model.
 */
export interface ModelFiltersConfig {
  onlyTextOutput: boolean;
  minContext: number;
}

/**
 * Represents the complete AI configuration stored in chrome.storage.sync.
 */
export interface AIConfig {
  provider: 'openrouter';
  apiKey: string;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  stream: boolean;
  reply: ReplyConfig;
  dm: DmConfig;
  attribution: AttributionConfig;
  modelFilters: ModelFiltersConfig;
}

/**
 * An object representing the calculated statistics for comments.
 */
export interface CommentStats {
  totalTopLevelNoReplies: number;
  userTopLevelNoReplies: number;
}

/**
 * Represents the state of the UI, managed by Zustand.
 */
export interface UIState {
  pipelineStatus: RunState;
  stats: CommentStats;
}

/**
 * Defines the structure for messages sent between extension components.
 */
export interface ExtensionMessage {
  type:
    | 'STATE_UPDATE'
    | 'GET_LATEST_STATE'
    | 'REQUEST_POST_STATE_FOR_EXPORT'
    | 'UPDATE_AI_CONFIG'
    | 'GET_AI_CONFIG'
    | 'GET_MODELS'
    | 'START_PIPELINE'
    | 'STOP_PIPELINE'
    | 'RESUME_PIPELINE'
    | 'LIKE_COMMENT';
  payload?: unknown;
}