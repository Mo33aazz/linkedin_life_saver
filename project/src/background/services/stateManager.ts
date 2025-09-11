/// <reference types="chrome" />

import type {
  Comment,
  CommentType,
  PostState,
  ParsedComment,
} from '../../shared/types';

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
  totalTopLevelNoReplies: number; // Repurposed: total top-level comments
  userTopLevelNoReplies: number; // Repurposed: top-level without my reply
}

/**
 * In-memory cache for post states.
 * The key is the post URN.
 */
const stateCache = new Map<string, PostState>();

/**
 * Helper function to check if a comment was authored by the current user by comparing usernames.
 * This ensures consistent username comparison across the application.
 * @param commentOwnerUrl The profile URL of the comment author
 * @param currentUserUrl The profile URL of the current user
 * @returns True if the comment was authored by the current user
 */
const isCommentByCurrentUser = (commentOwnerUrl: string, currentUserUrl: string): boolean => {
  if (!commentOwnerUrl || !currentUserUrl) {
    return false;
  }

  // Extract usernames from both URLs
  const extractUsername = (url: string): string | null => {
    const match = url.match(/\/in\/([^/]+)\/?/);
    return match ? match[1] : null;
  };

  const commentUsername = extractUsername(commentOwnerUrl);
  const currentUsername = extractUsername(currentUserUrl);

  return commentUsername !== null && currentUsername !== null && commentUsername === currentUsername;
};

/**
 * Calculates statistics about comments on a post.
 * - Total number of top-level comments.
 * - Number of top-level comments without user's reply (excluding user's own comments).
 *
 * This function uses an efficient two-pass approach. The first pass collects
 * the IDs of all comment threads that have replies authored by the user into a Set for quick lookups.
 * The second pass iterates through the comments again, counting only the top-level
 * comments that are not authored by the user and whose thread IDs were not found in the set of replied threads.
 *
 * @param comments - An array of all comments parsed from the page.
 * @param userProfileUrl - The profile URL of the signed-in user.
 * @returns An object containing the calculated statistics.
 */
export const calculateCommentStats = (
  comments: CommentLike[],
  userProfileUrl: string
): CommentStats => {
  // Identify all threads that contain at least one reply authored by me
  const threadsWithMyReply = new Set<string>();
  comments.forEach((c) => {
    if (c.type === 'reply' && isCommentByCurrentUser(c.ownerProfileUrl, userProfileUrl)) {
      threadsWithMyReply.add(c.threadId);
    }
  });

  let totalTopLevel = 0; // total post top-level comments
  let topLevelWithoutMyReply = 0; // top-level comments without my reply

  comments.forEach((c) => {
    if (c.type === 'top-level') {
      totalTopLevel++;
      const authoredByMe = isCommentByCurrentUser(c.ownerProfileUrl, userProfileUrl);
      if (!authoredByMe && !threadsWithMyReply.has(c.threadId)) {
        topLevelWithoutMyReply++;
      }
    }
  });

  return {
    totalTopLevelNoReplies: totalTopLevel,
    userTopLevelNoReplies: topLevelWithoutMyReply,
  };
};

/**
 * Saves the entire state for a given post to chrome.storage.local and updates the cache.
 * The post's URN is used as the key. The in-memory PostState is transformed
 * into the required storage format before saving. The `lastUpdated` timestamp is
 * automatically set to the current time on every save.
 *
 * @param postUrn - The unique URN of the post, used as the storage key.
 * @param state - The PostState object to save.
 */
export const savePostState = async (
  postUrn: string,
  state: PostState
): Promise<void> => {
  try {
    // Create a new state object with an updated timestamp to ensure data freshness
    // and to avoid mutating the original state object passed into the function.
    const stateToSave: PostState = {
      ...state,
      _meta: {
        ...state._meta,
        lastUpdated: new Date().toISOString(),
      },
    };

    await chrome.storage.local.set({ [postUrn]: stateToSave });
    stateCache.set(postUrn, stateToSave);
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
): Promise<PostState | undefined> => {
  try {
    const storageResult = await chrome.storage.local.get(postUrn);
    const storedData = storageResult?.[postUrn];

    if (storedData) {
      const state = storedData as PostState;
      stateCache.set(postUrn, state);
      console.log(`State loaded for post URN: ${postUrn}`);
      return state;
    }
    console.log(`No state found for post URN: ${postUrn}`);
    return undefined;
  } catch (error) {
    console.error(`Error loading state for post URN ${postUrn}:`, error);
    return undefined;
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

/**
 * Clears a post's state from storage and cache.
 * @param postUrn - The unique URN of the post.
 */
export const clearPostState = async (postUrn: string): Promise<void> => {
  try {
    await chrome.storage.local.remove(postUrn);
    stateCache.delete(postUrn);
    console.log(`Cleared state for post URN: ${postUrn}`);
  } catch (error) {
    console.error(`Error clearing state for post URN ${postUrn}:`, error);
  }
};

/**
 * Updates an existing PostState with newly captured comment data from the DOM.
 * It adds any new comments (e.g., replies posted by the extension) and preserves
 * the pipeline status of existing comments.
 *
 * @param postUrn The URN of the post to update.
 * @param capturedData The newly scraped data from the content script.
 */
export const mergeCapturedState = (
  postUrn: string,
  capturedData: { comments: ParsedComment[] }
): void => {
  const existingState = getPostState(postUrn);
  if (!existingState) {
    console.warn(`Cannot merge state for ${postUrn}, no existing state found.`);
    return;
  }

  const existingCommentsMap = new Map<string, Comment>(
    existingState.comments.map(c => [c.commentId, c])
  );

  let newCommentsFound = 0;

  capturedData.comments.forEach(parsedComment => {
    if (!existingCommentsMap.has(parsedComment.commentId)) {
      // This is a new comment, likely a reply we just posted.
      const newComment: Comment = {
        ...parsedComment,
        connected: undefined, // Connection status is unknown for new comments
        likeStatus: '', // Initialize pipeline fields
        replyStatus: '',
        dmStatus: '',
        attempts: { like: 0, reply: 0, dm: 0 },
        lastError: '',
        pipeline: {
          queuedAt: new Date().toISOString(),
          likedAt: '',
          repliedAt: '',
          dmAt: '',
        },
      };
      existingState.comments.push(newComment);
      newCommentsFound++;
    }
  });

  if (newCommentsFound > 0) {
    console.log(`Merged state for ${postUrn}: Added ${newCommentsFound} new comments.`);
    // The savePostState function will automatically update the timestamp.
    savePostState(postUrn, existingState);
  } else {
    console.log(`Merged state for ${postUrn}: No new comments found.`);
  }
};
