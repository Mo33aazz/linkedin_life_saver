// src/background/services/pipelineManager.ts

import { RunState, PostState, Comment } from '../../shared/types';
import { getPostState, savePostState } from './stateManager';

// Internal state for the pipeline
let pipelineStatus: RunState = 'idle';
let activePostUrn: string | null = null;
let isProcessing = false; // A lock to prevent concurrent processing loops

// This will be set by the main service worker script to broadcast updates
let broadcastUpdate: () => void = () => {
  console.warn('broadcastUpdate not initialized in PipelineManager');
};

export const initPipelineManager = (broadcaster: () => void) => {
  broadcastUpdate = broadcaster;
};

const findNextComment = (postState: PostState): Comment | null => {
  for (const comment of postState.comments) {
    // A comment needs processing if its like or reply status is not 'DONE' or 'FAILED'
    if (comment.likeStatus === '' || comment.replyStatus === '') {
      return comment;
    }
  }
  return null; // No more comments to process
};

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
      broadcastUpdate(); // Broadcast progress (state of comments changed)
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
      broadcastUpdate(); // Broadcast progress
      return;
    }
  } catch (error) {
    console.error(`Failed to process comment ${comment.commentId}:`, error);
    // TODO: Implement error handling (update lastError, attempts, set status to FAILED)
  }
};

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

    const nextComment = findNextComment(postState);

    if (!nextComment) {
      console.log('All comments have been processed. Pipeline finished.');
      pipelineStatus = 'idle';
      postState._meta.runState = 'idle';
      await savePostState(postState._meta.postId, postState);
      break; // Exit the loop
    }

    await processComment(nextComment, postState);

    // TODO: Implement a configurable delay with jitter later
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
  }

  isProcessing = false;
  console.log(`Processing loop ended. Final status: ${pipelineStatus}`);
  broadcastUpdate(); // Broadcast final status
};

export const startPipeline = async (postUrn: string): Promise<void> => {
  if (pipelineStatus !== 'idle') {
    console.warn(`Pipeline cannot be started from state: ${pipelineStatus}`);
    return;
  }
  const postState = getPostState(postUrn);
  if (!postState) {
    console.error(`Cannot start pipeline, no state found for post ${postUrn}`);
    return;
  }

  console.log(`Starting pipeline for post: ${postUrn}`);
  pipelineStatus = 'running';
  activePostUrn = postUrn;
  postState._meta.runState = 'running';
  await savePostState(postUrn, postState);

  processQueue();
};

export const stopPipeline = async (): Promise<void> => {
  if (pipelineStatus !== 'running') {
    console.warn('Pipeline is not running.');
    return;
  }
  if (!activePostUrn) {
    console.error('Cannot stop pipeline, no active post.');
    pipelineStatus = 'error'; // Should not happen
    return;
  }

  console.log('Stopping pipeline...');
  pipelineStatus = 'paused';

  const postState = getPostState(activePostUrn);
  if (postState) {
    postState._meta.runState = 'paused';
    await savePostState(activePostUrn, postState);
  }
};

export const resumePipeline = async (): Promise<void> => {
  if (pipelineStatus !== 'paused') {
    console.warn('Pipeline is not paused.');
    return;
  }
  if (!activePostUrn) {
    console.error('Cannot resume, no active post was paused.');
    return;
  }

  const postState = getPostState(activePostUrn);
  if (!postState) {
    console.error(`Cannot resume, no state found for post ${activePostUrn}`);
    return;
  }

  console.log(`Resuming pipeline for post: ${activePostUrn}`);
  pipelineStatus = 'running';
  postState._meta.runState = 'running';
  await savePostState(activePostUrn, postState);

  processQueue();
};

export const getPipelineStatus = (): RunState => {
  return pipelineStatus;
};