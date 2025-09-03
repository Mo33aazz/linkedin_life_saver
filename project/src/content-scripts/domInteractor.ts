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
    console.warn('Max scroll attempts reached. There might be more content to load.');
  }
};