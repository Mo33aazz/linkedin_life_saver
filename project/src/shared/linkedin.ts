export const LINKEDIN_FEED_POST_REGEX =
  /^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:\d+\/?(?:\?.*)?$/;

export const LINKEDIN_ACTIVITY_URN_REGEX = /(urn:li:activity:\d+)/;

const LINKEDIN_POSTS_ACTIVITY_REGEX = /activity-(\d+)/;

const LINKEDIN_POSTS_URL_REGEX =
  /^https:\/\/www\.linkedin\.com\/posts\/.+activity-\d+.*$/;

/**
 * Determine whether a given URL points to a LinkedIn post that the
 * extension can operate on. Handles both legacy feed URLs and the newer
 * `/posts/` style URLs.
 */
export const isLinkedInPostUrl = (url: string | undefined | null): boolean => {
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }

  return (
    LINKEDIN_FEED_POST_REGEX.test(url) || LINKEDIN_POSTS_URL_REGEX.test(url)
  );
};

/**
 * Extract the LinkedIn post URN (`urn:li:activity:{id}`) from the supplied URL.
 * Supports both direct URNs in the URL and `activity-{id}` segments from the
 * newer `/posts/` URLs.
 */
export const getPostUrnFromUrl = (url: string | undefined | null): string | null => {
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }

  const urnMatch = url.match(LINKEDIN_ACTIVITY_URN_REGEX);
  if (urnMatch?.[1]) {
    return urnMatch[1];
  }

  const activityMatch = url.match(LINKEDIN_POSTS_ACTIVITY_REGEX);
  if (activityMatch?.[1]) {
    return `urn:li:activity:${activityMatch[1]}`;
  }

  return null;
};
