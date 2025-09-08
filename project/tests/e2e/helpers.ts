/**
 * Build commonly used LinkedIn URLs for tests.
 */
export function getLinkedInUrl(kind: 'post', urn: string): string {
  switch (kind) {
    case 'post':
      // Example: https://www.linkedin.com/feed/update/urn:li:activity:123456789/
      return `https://www.linkedin.com/feed/update/${urn}/`;
    default:
      throw new Error(`Unsupported LinkedIn URL kind: ${kind}`);
  }
}

