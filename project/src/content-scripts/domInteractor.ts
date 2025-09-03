/**
 * A helper function to pause execution for a specified duration.
 * @param ms - The number of milliseconds to wait.
 */
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Automatically scrolls the page down to load all comments.
 * It continues scrolling until the page height no longer increases,
 * or until a maximum number of scroll attempts is reached.
 */
export const autoScrollPage = async (): Promise<void> => {
  const SCROLL_DELAY_MS = 2000;
  const MAX_SCROLLS = 20;
  let scrolls = 0;

  let lastHeight = document.body.scrollHeight;

  console.log('Starting auto-scroll to load all comments...');

  while (scrolls < MAX_SCROLLS) {
    window.scrollTo(0, document.body.scrollHeight);
    await delay(SCROLL_DELAY_MS);

    const newHeight = document.body.scrollHeight;

    if (newHeight === lastHeight) {
      console.log('Page height stabilized. Auto-scrolling complete.');
      break;
    }

    lastHeight = newHeight;
    scrolls++;
    console.log(`Scrolled... Attempt ${scrolls}/${MAX_SCROLLS}`);
  }

  if (scrolls >= MAX_SCROLLS) {
    console.warn(
      'Max scroll attempts reached. There might be more content to load.'
    );
  }
};

/**
 * A centralized object for all DOM selectors used in the application.
 * This makes it easier to update selectors if LinkedIn changes its markup.
 */
const SELECTORS = {
  signedInUser: {
    profileLink: 'a.profile-card-profile-link',
  },
  comment: {
    container: 'article.comments-comment-entity',
    ownerProfileLink: 'a.comments-comment-meta__image-link',
    textContent: 'span.comments-comment-item__main-content',
    timestamp: 'time',
    repliesContainer: 'div.comments-comment-item__replies-container',
  },
};

/**
 * Represents the structured data extracted for a single comment.
 */
export interface ParsedComment {
  commentId: string;
  ownerProfileUrl: string;
  text: string;
  timestamp: string;
  type: 'top-level' | 'reply';
  threadId: string;
}

/**
 * Parses the DOM to find the profile URL of the currently signed-in user.
 * @returns The full profile URL as a string, or null if not found.
 */
export const getSignedInUserProfileUrl = (): string | null => {
  const profileLinkElement = document.querySelector<HTMLAnchorElement>(
    SELECTORS.signedInUser.profileLink
  );

  if (!profileLinkElement) {
    console.warn('Could not find signed-in user profile link.');
    return null;
  }

  const relativeUrl = profileLinkElement.getAttribute('href');
  if (!relativeUrl) {
    console.warn('Profile link element found, but it has no href attribute.');
    return null;
  }

  // Ensure the URL is absolute
  if (relativeUrl.startsWith('https://www.linkedin.com')) {
    return relativeUrl;
  }

  return `https://www.linkedin.com${relativeUrl}`;
};

/**
 * Extracts all comments from the page and parses them into a structured format.
 * @returns An array of ParsedComment objects.
 */
export const extractComments = (): ParsedComment[] => {
  const commentElements = document.querySelectorAll<HTMLElement>(
    SELECTORS.comment.container
  );
  const comments: ParsedComment[] = [];

  console.log(`Found ${commentElements.length} potential comment elements.`);

  commentElements.forEach((commentElement, index) => {
    const ownerLinkElement = commentElement.querySelector<HTMLAnchorElement>(
      SELECTORS.comment.ownerProfileLink
    );
    const textElement = commentElement.querySelector<HTMLElement>(
      SELECTORS.comment.textContent
    );
    const timestampElement = commentElement.querySelector<HTMLElement>(
      SELECTORS.comment.timestamp
    );

    const commentId = commentElement.getAttribute('data-entity-urn') || '';

    const isReplyContainer = commentElement.parentElement?.closest(
      SELECTORS.comment.repliesContainer
    );
    const type = isReplyContainer ? 'reply' : 'top-level';

    let threadId = '';
    if (type === 'reply' && isReplyContainer) {
      const topLevelComment = isReplyContainer.closest(
        SELECTORS.comment.container
      );
      threadId = topLevelComment?.getAttribute('data-entity-urn') || '';
    } else {
      threadId = commentId;
    }

    const ownerRelativeUrl = ownerLinkElement?.getAttribute('href');
    let ownerProfileUrl = '';
    if (ownerRelativeUrl) {
      // Ensure the URL is absolute, making it consistent with getSignedInUserProfileUrl
      if (ownerRelativeUrl.startsWith('https://www.linkedin.com')) {
        ownerProfileUrl = ownerRelativeUrl;
      } else {
        ownerProfileUrl = `https://www.linkedin.com${ownerRelativeUrl}`;
      }
    }
    const text = textElement?.innerText.trim() ?? '';
    const timestamp = timestampElement?.innerText.trim() ?? '';

    if (commentId && ownerProfileUrl && text && timestamp && threadId) {
      comments.push({
        commentId,
        ownerProfileUrl,
        text,
        timestamp,
        type,
        threadId,
      });
    } else {
      console.warn(`Skipping comment #${index + 1} due to missing data.`, {
        hasCommentId: !!commentId,
        hasOwnerUrl: !!ownerProfileUrl,
        hasText: !!text,
        hasTimestamp: !!timestamp,
        hasThreadId: !!threadId,
        element: commentElement,
      });
    }
  });

  console.log(`Successfully extracted ${comments.length} comments.`);
  return comments;
};