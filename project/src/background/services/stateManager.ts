import { CommentType } from '../../shared/types';

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