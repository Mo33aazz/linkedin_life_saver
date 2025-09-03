import { CommentType, PostState } from '../../shared/types';

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
 * Saves the entire state for a given post to chrome.storage.local.
 * The post's URN is used as the key.
 *
 * @param postUrn - The unique URN of the post, used as the storage key.
 * @param state - The PostState object to save.
 */
export const savePostState = async (
  postUrn: string,
  state: PostState
): Promise<void> => {
  try {
    await chrome.storage.local.set({ [postUrn]: state });
    console.log(`State saved for post URN: ${postUrn}`);
  } catch (error) {
    console.error(`Error saving state for post URN ${postUrn}:`, error);
  }
};

/**
 * Loads the state for a given post from chrome.storage.local.
 *
 * @param postUrn - The unique URN of the post to load.
 * @returns A Promise that resolves to the PostState object if found, otherwise null.
 */
export const loadPostState = async (
  postUrn: string
): Promise<PostState | null> => {
  try {
    const storageResult = await chrome.storage.local.get(postUrn);
    if (storageResult && storageResult[postUrn]) {
      console.log(`State loaded for post URN: ${postUrn}`);
      return storageResult[postUrn] as PostState;
    }
    console.log(`No state found for post URN: ${postUrn}`);
    return null;
  } catch (error) {
    console.error(`Error loading state for post URN ${postUrn}:`, error);
    return null;
  }
};