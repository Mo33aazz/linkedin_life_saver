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
 * Represents the entire state object for a single post, as stored in a JSON file.
 * It includes metadata and a list of comments, keyed by the post's URL.
 */
export type PostState = {
  _meta: Post;
} & {
  [postUrl: string]: Comment[];
};

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