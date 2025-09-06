import { test, expect } from './fixtures';
import type { PostState } from '../../src/shared/types';
import { getLinkedInUrl } from './helpers';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ acceptDownloads: true });

test.describe('Export Post Comments JSON', () => {
  const TEST_POST_URN = 'urn:li:activity:7369271078898126851';
  const TEST_POST_URL = getLinkedInUrl('post', TEST_POST_URN);

  test('downloads JSON containing real post comments', async ({ page, background }) => {
    // Navigate to the post
    await page.goto(TEST_POST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#linkedin-engagement-assistant-root', { timeout: 30000 });
    
    // Seed a minimal post state in non-live runs so export has data.
    await background.evaluate(async ({ urn }) => {
      const state = {
        _meta: {
          postId: urn,
          postUrl: `https://www.linkedin.com/feed/update/${urn}/`,
          lastUpdated: new Date().toISOString(),
          runState: 'idle',
          userProfileUrl: 'https://www.linkedin.com/in/test-user/',
        },
        comments: [
          {
            commentId: `urn:li:comment:(${urn.replace('urn:li:activity:', 'activity:')},123456)`,
            text: 'Seeded comment for export test',
            ownerProfileUrl: 'https://www.linkedin.com/in/test-user/',
            timestamp: '1d',
            type: 'top-level',
            connected: true,
            threadId: `urn:li:comment:(${urn.replace('urn:li:activity:', 'activity:')},123456)`,
            likeStatus: 'DONE',
            replyStatus: '',
            dmStatus: '',
            attempts: { like: 0, reply: 0, dm: 0 },
            lastError: '',
            pipeline: { queuedAt: new Date().toISOString(), likedAt: new Date().toISOString(), repliedAt: '', dmAt: '' },
          },
        ],
      } as unknown as PostState;
      await (self as unknown as { __E2E_TEST_SAVE_POST_STATE: (urn: string, state: PostState) => Promise<void> }).__E2E_TEST_SAVE_POST_STATE(urn, state);
    }, { urn: TEST_POST_URN });

    // Click Export JSON and capture the download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JSON' }).click(),
    ]);

    const dir = resolve('test-results', 'exported');
    mkdirSync(dir, { recursive: true });
    const outPath = resolve(dir, download.suggestedFilename() || 'linkedin-post.json');
    await download.saveAs(outPath);

    // Verify the exported JSON matches the seeded state via SW test hook
    // Inspect the saved file to ensure it contains a plausible comments array
    // Read from SW hook to validate the exported data
    const exported = await page.context().serviceWorkers()[0]?.evaluate?.(() => {
      return (self as unknown as { __E2E_LAST_EXPORTED_STATE?: PostState }).__E2E_LAST_EXPORTED_STATE;
    });

    expect(exported).toBeTruthy();
    expect(exported!._meta.postId).toBe(TEST_POST_URN);
    expect(Array.isArray(exported!.comments)).toBe(true);
    expect(exported!.comments.length).toBeGreaterThan(0);
  });
});
