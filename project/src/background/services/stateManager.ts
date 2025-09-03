/// <reference types="chrome" />

import { Comment, CommentType, Post, PostState } from '../../shared/types';

// A minimal interface for the data required by the stats calculation.
// This decouples the function from the full state-managed `Comment` object.
type CommentLike = {
  type: CommentType;
  threadId: string;
  ownerProfileUrl: string;
};

/**
 * An object representing the calculated statistics for comments.
 */
export interface CommentStats {
  totalTopLevelNoReplies: number;
  userTopLevelNoReplies: number;
}

/**
 * In-memory cache for post states.
 * The key is the post URN.
 */
const stateCache = new Map<string, PostState>();

/**
 * Calculates statistics about comments on a post.
 * - Total number of top-level comments without any replies.
 * - Number of the user's own top-level comments without any replies.
 *
 * This function uses an efficient two-pass approach. The first pass collects
 * the IDs of all comment threads that have replies into a Set for quick lookups.
 * The second pass iterates through the comments again, counting only the top-level
 * comments whose thread IDs were not found in the set of replied threads.
 *
 * @param comments - An array of all comments parsed from the page.
 * @param userProfileUrl - The profile URL of the signed-in user.
 * @returns An object containing the calculated statistics.
 */
export const calculateCommentStats = (
  comments: CommentLike[],
  userProfileUrl: string
): CommentStats => {
  // First pass: Identify all thread IDs that have at least one reply.
  const repliedThreadIds = new Set<string>();
  comments.forEach(comment => {
    if (comment.type === 'reply') {
      repliedThreadIds.add(comment.threadId);
    }
  });

  // Second pass: Count top-level comments that are in threads with no replies.
  let totalTopLevelNoReplies = 0;
  let userTopLevelNoReplies = 0;

  comments.forEach(comment => {
    // Check if it's a top-level comment and its thread has no replies.
    if (
      comment.type === 'top-level' &&
      !repliedThreadIds.has(comment.threadId)
    ) {
      totalTopLevelNoReplies++;

      // Additionally, check if this comment belongs to the user.
      if (comment.ownerProfileUrl === userProfileUrl) {
        userTopLevelNoReplies++;
      }
    }
  });

  return {
    totalTopLevelNoReplies,
    userTopLevelNoReplies,
  };
};

/**
 * Saves the entire state for a given post to chrome.storage.local and updates the cache.
 * The post's URN is used as the key. The in-memory PostState is transformed
 * into the required storage format before saving.
 *
 * @param postUrn - The unique URN of the post, used as the storage key.
 * @param state - The PostState object to save.
 */
export const savePostState = async (
  postUrn: string,
  state: PostState
): Promise<void> => {
  try {
    const storableState = {
      _meta: state._meta,
      [state._meta.postUrl]: state.comments,
    };
    await chrome.storage.local.set({ [postUrn]: storableState });
    stateCache.set(postUrn, state);
    console.log(`State saved for post URN: ${postUrn}`);
  } catch (error) {
    console.error(`Error saving state for post URN ${postUrn}:`, error);
  }
};

/**
 * Loads the state for a given post from chrome.storage.local into the cache.
 * Transforms the stored format back into the in-memory PostState representation.
 *
 * @param postUrn - The unique URN of the post to load.
 * @returns A Promise that resolves to the PostState object if found, otherwise null.
 */
export const loadPostState = async (
  postUrn: string
): Promise<PostState | null> => {
  try {
    const storageResult = await chrome.storage.local.get(postUrn);
    const storedData = storageResult?.[postUrn];

    if (storedData && storedData._meta && storedData._meta.postUrl) {
      const meta = storedData._meta as Post;
      const comments = (storedData[meta.postUrl] || []) as Comment[];

      const state: PostState = {
        _meta: meta,
        comments,
      };
      stateCache.set(postUrn, state);
      console.log(`State loaded for post URN: ${postUrn}`);
      return state;
    }
    console.log(`No state found for post URN: ${postUrn}`);
    return null;
  } catch (error) {
    console.error(`Error loading state for post URN ${postUrn}:`, error);
    return null;
  }
};

/**
 * Loads all post states from chrome.storage.local into the in-memory cache on startup.
 */
export const loadAllStates = async (): Promise<void> => {
  try {
    const allData = await chrome.storage.local.get(null);
    const postUrns = Object.keys(allData).filter(key =>
      key.startsWith('urn:li:activity:')
    );

    for (const postUrn of postUrns) {
      await loadPostState(postUrn); // This will load and cache
    }
    console.log(`Loaded ${stateCache.size} post states into memory.`);
  } catch (error) {
    console.error('Error loading all states on startup:', error);
  }
};

/**
 * Retrieves a post's state from the in-memory cache.
 *
 * @param postUrn - The unique URN of the post.
 * @returns The PostState object if found in the cache, otherwise undefined.
 */
export const getPostState = (postUrn: string): PostState | undefined => {
  return stateCache.get(postUrn);
};