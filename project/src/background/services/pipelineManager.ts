// src/background/services/pipelineManager.ts

import { RunState, PostState, Comment } from '../../shared/types';
import { getPostState, savePostState } from './stateManager';

// Internal state for the pipeline
let pipelineStatus: RunState = 'idle';
let activePostUrn: string | null = null;
let isProcessing = false; // A lock to prevent concurrent processing loops

// TODO: Placeholder for broadcasting state updates to the UI
const broadcastUpdate = () => {
  console.log('Broadcasting state update to UI...');
};

/**
 * Starts the processing pipeline for a given post.
 * @param postUrn - The URN of the post to process.
 */
export const startPipeline = async (postUrn: string): Promise<void> => {
  if (pipelineStatus === 'running') {
    console.warn('Pipeline is already running.');
    return;
  }

  console.log(`Starting pipeline for post: ${postUrn}`);
  pipelineStatus = 'running';
  activePostUrn = postUrn;

  // Kick off the processing loop, but don't block the caller.
  processQueue();

  broadcastUpdate(); // Notify UI that the state is now 'running'
};

/**
 * Stops the processing pipeline gracefully.
 */
export const stopPipeline = (): void => {
  if (pipelineStatus !== 'running') {
    console.warn('Pipeline is not running.');
    return;
  }

  console.log('Stopping pipeline...');
  pipelineStatus = 'paused';

  broadcastUpdate(); // Notify UI that the state is now 'paused'
};

/**
 * Gets the current status of the pipeline.
 */
export const getPipelineStatus = (): RunState => {
  return pipelineStatus;
};

/**
 * The main processing loop. It finds the next comment and action,
 * executes it, and then waits before processing the next.
 */
const processQueue = async (): Promise<void> => {
  if (isProcessing) {
    console.log('Processing is already in progress.');
    return;
  }
  isProcessing = true;

  while (pipelineStatus === 'running') {
    if (!activePostUrn) {
      console.error('No active post URN. Stopping pipeline.');
      pipelineStatus = 'error';
      break;
    }

    const postState = getPostState(activePostUrn);
    if (!postState) {
      console.error(`State for post ${activePostUrn} not found. Stopping.`);
      pipelineStatus = 'error';
      break;
    }

    // Find the next comment that needs an action
    const nextComment = findNextComment(postState);

    if (!nextComment) {
      console.log('All comments have been processed. Pipeline finished.');
      pipelineStatus = 'idle';
      break; // Exit the loop
    }

    // Process the next required action for this comment
    await processComment(nextComment, postState);

    // TODO: Implement a configurable delay with jitter later
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
  }

  isProcessing = false;
  console.log(`Processing loop ended. Final status: ${pipelineStatus}`);
  broadcastUpdate(); // Notify UI of the final state
};

/**
 * Finds the first comment in the list that has a pending action.
 * @param postState - The current state of the post.
 * @returns The comment to process, or null if all are done.
 */
const findNextComment = (postState: PostState): Comment | null => {
  // For now, we only target top-level comments without replies from the user.
  // This logic will become more sophisticated later.
  for (const comment of postState.comments) {
    // A comment needs processing if its like or reply status is not 'DONE' or 'FAILED'
    if (comment.likeStatus === '' || comment.replyStatus === '') {
      // Add more conditions here for DM, etc. in the future
      return comment;
    }
  }
  return null; // No more comments to process
};

/**
 * Processes the next required action for a single comment (FSM).
 * @param comment - The comment to process.
 * @param postState - The parent PostState object.
 */
const processComment = async (
  comment: Comment,
  postState: PostState
): Promise<void> => {
  try {
    // STATE: QUEUED -> LIKED
    if (comment.likeStatus === '') {
      console.log(`Liking comment: ${comment.commentId}`);
      // In a real implementation, this would send a message to the content script.
      // For now, we'll simulate success.
      comment.likeStatus = 'DONE';
      comment.pipeline.likedAt = new Date().toISOString();
      await savePostState(postState._meta.postId, postState);
      broadcastUpdate();
      return; // IMPORTANT: Return after each atomic action.
    }

    // STATE: LIKED -> REPLIED
    if (comment.replyStatus === '') {
      console.log(`Replying to comment: ${comment.commentId}`);
      // This will involve calling the OpenRouterClient and then the domInteractor.
      // For now, we'll simulate success.
      comment.replyStatus = 'DONE';
      comment.pipeline.repliedAt = new Date().toISOString();
      await savePostState(postState._meta.postId, postState);
      broadcastUpdate();
      return;
    }

    // Future states (like DM_SENT) would be added here as more `if` blocks.
  } catch (error) {
    console.error(`Failed to process comment ${comment.commentId}:`, error);
    // TODO: Implement error handling (update lastError, attempts, set status to FAILED)
  }
};