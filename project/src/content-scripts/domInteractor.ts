import type { ParsedComment, CapturedPostState } from '../shared/types';

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
    sidebarContainer: '.scaffold-layout__sticky',
    profileCard: '.profile-card',
  },
  comment: {
    container: 'article.comments-comment-entity:not(.comments-comment-entity--reply)',
    replyContainer: 'article.comments-comment-entity--reply',
    allComments: 'article.comments-comment-entity',
    ownerProfileLink: 'a.comments-comment-meta__image-link',
    replyAuthorMeta: '.comments-comment-meta__actor',
    textContent: 'span.comments-comment-item__main-content',
    timestamp: 'time',
    repliesContainer: 'div.comments-comment-item__replies-container',
    likeButton: 'button.reactions-react-button[aria-label*="React Like"]',
    replyButton: 'button.comments-comment-social-bar__reply-action-button--cr[aria-label*="Reply to"]',
    replyEditor: 'div.comments-comment-texteditor .ql-editor[contenteditable="true"]',
    replySubmitButton: 'button.comments-comment-box__submit-button--cr',
  },
  dm: {
    messageInput: 'div.msg-form__contenteditable[contenteditable="true"]',
    sendButton: 'button.msg-form__send-button',
  },
};

/**
 * Extracts the username from the sidebar profile card following the specified pattern.
 * Looks for href attributes that match "/in/{{username}}/" pattern.
 * @returns The username string, or null if not found.
 */
export const extractUsernameFromSidebar = (): string | null => {
  // Step 1: Locate the sidebar container
  const sidebarContainer = document.querySelector(SELECTORS.signedInUser.sidebarContainer);
  if (!sidebarContainer) {
    console.warn('Could not find sidebar container with class scaffold-layout__sticky.');
    return null;
  }

  // Step 2: Find the profile card within the sidebar
  const profileCard = sidebarContainer.querySelector(SELECTORS.signedInUser.profileCard);
  if (!profileCard) {
    console.warn('Could not find profile card within sidebar container.');
    return null;
  }

  // Step 3: Find anchor tags with href pattern "/in/{{username}}/"
  const profileLinks = profileCard.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]');
  
  for (const link of profileLinks) {
    const href = link.getAttribute('href');
    if (href) {
      // Extract username from pattern /in/{{username}}/
      const match = href.match(/\/in\/([^/]+)\/?/);
      if (match && match[1]) {
        console.log(`Extracted username from sidebar: ${match[1]}`);
        return match[1];
      }
    }
  }

  console.warn('Could not extract username from sidebar profile card.');
  return null;
};

/**
 * Parses the DOM to find the profile URL of the currently signed-in user.
 * @returns The full profile URL as a string, or null if not found.
 */
export const getSignedInUserProfileUrl = (): string | null => {
  // First try the new method to extract username from sidebar
  const username = extractUsernameFromSidebar();
  if (username) {
    return `https://www.linkedin.com/in/${username}/`;
  }

  // Fallback to the original method
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
 * Checks if a comment was authored by the current user by comparing usernames.
 * @param commentOwnerUrl The profile URL of the comment author
 * @param currentUserUrl The profile URL of the current user
 * @returns True if the comment was authored by the current user
 */
export const isCommentByCurrentUser = (commentOwnerUrl: string, currentUserUrl: string): boolean => {
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
 * Extracts comments from the page and parses them into a structured format.
 * Implements critical checks: CHECK A (user already replied in thread) and CHECK B (data-processed attribute).
 * Only processes top-level comments that haven't been handled before.
 * @param maxComments Maximum number of comments to extract (default: 10)
 * @returns An array of ParsedComment objects.
 */
export const extractComments = (maxComments: number = 10): ParsedComment[] => {
  // Get only top-level comments (not replies)
  const topLevelCommentElements = document.querySelectorAll<HTMLElement>(
    SELECTORS.comment.container
  );
  const comments: ParsedComment[] = [];
  let totalTopLevelCount = 0;
  let processedCount = 0;
  
  // Get the target user's profile URL for filtering
  const targetUserProfileUrl = getSignedInUserProfileUrl();

  console.log(`Found ${topLevelCommentElements.length} top-level comment elements. Limiting to ${maxComments} comments.`);

  for (let index = 0; index < topLevelCommentElements.length && processedCount < maxComments; index++) {
    const commentElement = topLevelCommentElements[index];
    
    // This comment is included in the Total Top-Level Comments count, even if it's skipped.
    totalTopLevelCount++;
    
    // ✅ CHECK A: Have the user processed this comment before in this session? (CRITICAL CHECK)
    // Look for replies within this top-level comment thread
    const replyElements = commentElement.querySelectorAll<HTMLElement>('article.comments-comment-entity--reply');
    let userAlreadyReplied = false;
    
    if (targetUserProfileUrl) {
      for (const replyElement of replyElements) {
        const metaActor = replyElement.querySelector(SELECTORS.comment.replyAuthorMeta);
        const replyAuthorLink = metaActor?.querySelector<HTMLAnchorElement>('a[href*="/in/"]');
        
        if (replyAuthorLink) {
          let replyAuthorUrl = replyAuthorLink.getAttribute('href') || '';
          // Ensure the URL is absolute
          if (replyAuthorUrl && !replyAuthorUrl.startsWith('https://www.linkedin.com')) {
            replyAuthorUrl = `https://www.linkedin.com${replyAuthorUrl}`;
          }
          
          if (isCommentByCurrentUser(replyAuthorUrl, targetUserProfileUrl)) {
            console.log(`CHECK A: Skipping comment #${totalTopLevelCount} - user has already replied in this thread`);
            userAlreadyReplied = true;
            break;
          }
        }
      }
    }
    
    if (userAlreadyReplied) {
      continue; // Skip this entire top-level comment
    }
    
    // ✅ CHECK B: Have we already processed this comment?
    const isAlreadyProcessed = commentElement.getAttribute('data-processed') === 'true';
    if (isAlreadyProcessed) {
      console.log(`CHECK B: Skipping comment #${totalTopLevelCount} - already processed (data-processed="true")`);
      continue; // Skip this comment
    }
    
    const type = 'top-level'; // We only process top-level comments now

    // Find the owner profile link for top-level comments
    const ownerLinkElement = commentElement.querySelector<HTMLAnchorElement>(
      SELECTORS.comment.ownerProfileLink
    );

    const textElement = commentElement.querySelector<HTMLElement>(
      SELECTORS.comment.textContent
    );
    const timestampElement = commentElement.querySelector<HTMLElement>(
      SELECTORS.comment.timestamp
    );

    const commentId = commentElement.getAttribute('data-id') || '';

    // For top-level comments, thread ID is the same as comment ID
    const threadId = commentId;

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
        hasUserReply: false, // Not needed since we handle this in CHECK A
      });
      processedCount++; // Only increment when we actually process a comment
    } else {
      console.warn(`Skipping comment #${totalTopLevelCount} due to missing data.`, {
        hasCommentId: !!commentId,
        hasOwnerUrl: !!ownerProfileUrl,
        hasText: !!text,
        hasTimestamp: !!timestamp,
        hasThreadId: !!threadId,
        type,
        element: commentElement,
      });
    }
  }

  console.log(`Successfully extracted ${comments.length} comments (processed ${processedCount}) from ${totalTopLevelCount} total top-level comments encountered.`);
  return comments;
};

/**
 * Finds a specific comment by its ID and clicks the 'Like' button.
 * @param commentId - The 'data-id' of the target comment.
 * @returns A promise that resolves to true if the action was successful, false otherwise.
 */
export const likeComment = async (commentId: string): Promise<boolean> => {
  console.log(`Attempting to like comment: ${commentId}`);

  // Try to locate the comment element robustly.
  // Some pages expose different ID formats; derive common variants.
  const numericMatch = commentId.match(/urn:li:comment:(?:\(activity:\d+,)?(\d+)\)?/);
  const numericId = numericMatch && numericMatch[1] ? numericMatch[1] : '';
  const plainUrnVariant = numericId ? `urn:li:comment:${numericId}` : '';

  const exactIdSelector = `${SELECTORS.comment.container}[data-id='${commentId}']`;
  const exactUrnSelector = `${SELECTORS.comment.container}[data-urn='${commentId}']`;
  const altIdSelector = plainUrnVariant ? `${SELECTORS.comment.container}[data-id='${plainUrnVariant}']` : '';
  const altUrnSelector = plainUrnVariant ? `${SELECTORS.comment.container}[data-urn='${plainUrnVariant}']` : '';
  // Sometimes nested nodes (not the article) carry the data-urn/id; grab closest article.
  const looseSelector = `[data-id='${commentId}'], [data-urn='${commentId}']`;
  const looseAltSelector = plainUrnVariant ? `[data-id='${plainUrnVariant}'], [data-urn='${plainUrnVariant}']` : '';

  let commentElement = document.querySelector<HTMLElement>(exactIdSelector)
    || document.querySelector<HTMLElement>(exactUrnSelector)
    || (altIdSelector ? document.querySelector<HTMLElement>(altIdSelector) : null)
    || (altUrnSelector ? document.querySelector<HTMLElement>(altUrnSelector) : null)
    || (document.querySelector<HTMLElement>(looseSelector)?.closest(
      SELECTORS.comment.container
    ) as HTMLElement | null);
  if (!commentElement && looseAltSelector) {
    const el = document.querySelector<HTMLElement>(looseAltSelector);
    if (el) commentElement = el.closest(SELECTORS.comment.container) as HTMLElement | null;
  }

  // If not found, try a short scroll-and-search loop to trigger lazy loading
  if (!commentElement) {
    for (let i = 0; i < 6 && !commentElement; i++) {
      window.scrollBy(0, 600);
      await delay(300);
      commentElement = document.querySelector<HTMLElement>(exactIdSelector)
        || document.querySelector<HTMLElement>(exactUrnSelector)
        || (altIdSelector ? document.querySelector<HTMLElement>(altIdSelector) : null)
        || (altUrnSelector ? document.querySelector<HTMLElement>(altUrnSelector) : null)
        || (document.querySelector<HTMLElement>(looseSelector)?.closest(
          SELECTORS.comment.container
        ) as HTMLElement | null);
      if (!commentElement && looseAltSelector) {
        const el2 = document.querySelector<HTMLElement>(looseAltSelector);
        if (el2) commentElement = el2.closest(SELECTORS.comment.container) as HTMLElement | null;
      }
    }
  }

  if (!commentElement) {
    console.warn(`Could not find comment element with ID: ${commentId}`);
    return false;
  }

  // Ensure the target is in view for more reliable interactions
  try {
    commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(400);
  } catch {}

  // Broaden the like button selector to account for UI variations
  const likeButton =
    commentElement.querySelector<HTMLButtonElement>(SELECTORS.comment.likeButton) ||
    commentElement.querySelector<HTMLButtonElement>('button.comments-comment-social-bar__reaction-button') ||
    commentElement.querySelector<HTMLButtonElement>('button[aria-label*="Like" i]') ||
    commentElement.querySelector<HTMLButtonElement>('button[aria-label*="React" i]');

  if (!likeButton) {
    console.warn(`Could not find 'Like' button for comment: ${commentId}`);
    return false;
  }

  // Idempotency check: if already liked, consider it a success.
  if (likeButton.getAttribute('aria-pressed') === 'true') {
    console.log(`Comment ${commentId} is already liked.`);
    return true;
  }

  // Perform a more realistic click sequence and wait for state change
  likeButton.focus();
  likeButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  likeButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  likeButton.click();

  // Wait up to ~1.5s for aria-pressed to flip to true
  const start = Date.now();
  while (Date.now() - start < 1500) {
    if (likeButton.getAttribute('aria-pressed') === 'true') break;
    await delay(150);
  }

  // Final verification
  if (likeButton.getAttribute('aria-pressed') !== 'true') {
    console.warn(`Like click did not register for comment: ${commentId}`);
    return false;
  }

  console.log(`Successfully liked comment: ${commentId}`);
  return true;
};

/**
 * Finds a specific comment, clicks the reply button, types the given text in a
 * human-like manner, and submits the reply.
 * @param commentId - The 'data-id' of the target comment.
 * @param replyText - The AI-generated text to post as a reply.
 * @returns A promise that resolves to true if the action was successful, false otherwise.
 */
export const replyToComment = async (
  commentId: string,
  replyText: string
): Promise<boolean> => {
  console.log(`Attempting to reply to comment: ${commentId}`);
  const commentSelector = `${SELECTORS.comment.container}[data-id='${commentId}']`;
  const commentElement = document.querySelector<HTMLElement>(commentSelector);

  if (!commentElement) {
    console.warn(`Could not find comment element with ID: ${commentId}`);
    return false;
  }

  const replyButton = commentElement.querySelector<HTMLButtonElement>(
    SELECTORS.comment.replyButton
  );

  if (!replyButton) {
    console.warn(`Could not find 'Reply' button for comment: ${commentId}`);
    return false;
  }

  replyButton.click();
  await delay(1500); // Wait for the reply editor to appear

  const editor = commentElement.querySelector<HTMLDivElement>(
    SELECTORS.comment.replyEditor
  );
  const submitButton = commentElement.querySelector<HTMLButtonElement>(
    SELECTORS.comment.replySubmitButton
  );

  if (!editor || !submitButton) {
    console.warn(
      `Could not find reply editor or submit button for comment: ${commentId}`
    );
    return false;
  }

  editor.focus();
  // Clear any placeholder text.
  editor.innerHTML = '';

  // Set the text content directly to avoid character-by-character formatting issues
  editor.textContent = replyText;
  
  // Simulate typing delay for more natural behavior
  await delay(replyText.length * 30 + Math.random() * 200);

  // Dispatch an input event to ensure LinkedIn's framework recognizes the change
  editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  await delay(500); // A brief pause after typing

  // Check if the button is disabled before clicking
  if (submitButton.disabled) {
    console.warn(`Submit button is disabled for comment: ${commentId}`);
    return false;
  }

  submitButton.click();
  await delay(2000); // Wait for the reply to be posted

  console.log(`Successfully replied to comment: ${commentId}`);
  return true;
};

/**
 * Navigates to a user's messaging thread, types the given text in a
 * human-like manner, and sends the direct message.
 * @param dmText - The AI-generated text to send as a DM.
 * @returns A promise that resolves to true if the action was successful, false otherwise.
 */
export const sendDm = async (dmText: string): Promise<boolean> => {
  console.log('Attempting to send a DM...');

  const editor = document.querySelector<HTMLDivElement>(SELECTORS.dm.messageInput);
  const submitButton = document.querySelector<HTMLButtonElement>(
    SELECTORS.dm.sendButton
  );

  if (!editor || !submitButton) {
    console.warn('Could not find DM editor or submit button.');
    return false;
  }

  editor.focus();
  editor.innerHTML = ''; // Clear any placeholder or draft text.

  // Set the text content directly to avoid character-by-character formatting issues
  editor.textContent = dmText;
  
  // Simulate typing delay for more natural behavior
  await delay(dmText.length * 25 + Math.random() * 150);

  editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  await delay(400);

  if (submitButton.disabled) {
    console.warn('DM submit button is disabled.');
    return false;
  }

  submitButton.click();
  await delay(2500); // Wait for message to be sent

  console.log('Successfully sent DM.');
  return true;
};

/**
 * Captures the current state of the post from the DOM, including all comments.
 * This is intended to be called after the extension has performed actions to
 * ensure the captured state is up-to-date.
 * @returns An object containing the latest comments, post URN, and post URL.
 */
export const capturePostStateFromDOM = (maxComments?: number): CapturedPostState => {
  console.log('Capturing post-state from the DOM...');
  const comments = extractComments(maxComments);
  const userProfileUrl = getSignedInUserProfileUrl() || '';

  const postUrnRegex = /(urn:li:activity:\d+)/;
  const match = window.location.href.match(postUrnRegex);
  const postUrn = match && match[1] ? match[1] : null;
  const postUrl = window.location.href;

  console.log(`Capture complete. Found ${comments.length} comments.`);
  return { comments, postUrn, postUrl, userProfileUrl };
};
