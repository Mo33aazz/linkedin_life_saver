import { test, expect } from '@playwright/test';

const SERVER_PORT = Number(process.env.SHARED_BROWSER_PORT || 9333);
const BASE = `http://localhost:${SERVER_PORT}`;
const STATUS_URL = `${BASE}/api/status`;
const ACTION_URL = `${BASE}/api/action`;

async function serverUp() {
  const res = await fetch(STATUS_URL).catch(() => null);
  if (!res || !res.ok) return false;
  const body = await res.json().catch(() => null);
  return Boolean(body?.ok);
}

async function action(payload: Record<string, unknown>) {
  const res = await fetch(ACTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(`Action failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function newTestPageId(retries = 8, delayMs = 300): Promise<string> {
  for (let i = 0; i < retries; i += 1) {
    try {
      const np = await action({ action: 'newPage' });
      const pageId = np?.pageId as string | undefined;
      if (pageId) return pageId;
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return '';
}



test('LinkedIn profile Message button click', async () => {
  test.setTimeout(180_000);

  const up = await serverUp();
  expect(up).toBeTruthy();

  // 1) Open a dedicated page via the shared browser server
  const pageId = await newTestPageId();
  expect(pageId).toBeTruthy();

  // 2) Navigate to the LinkedIn profile URL
  const targetUrl = 'https://www.linkedin.com/in/moazmali/';
  await action({ 
    action: 'goto', 
    pageId, 
    url: targetUrl, 
    waitUntil: 'domcontentloaded', 
    timeoutMs: 60_000 
  });

  // 3) Wait for page to load and find Message button
  await new Promise(r => setTimeout(r, 3000)); // Wait for page to fully load

  // Look for Message button using regex pattern
  const messageButtonFound = await action({
    action: 'evaluate',
    pageId,
    expression: `
      // Find all buttons on the page
      const buttons = Array.from(document.querySelectorAll('button'));
      
      // Look for button with text "Message" or aria-label "Message [Name]"
      const messageButton = buttons.find(btn => {
        const text = (btn.textContent || btn.innerText || '').trim();
        const ariaLabel = btn.getAttribute('aria-label') || '';
        // Match exact "Message" text or "Message [Name]" in aria-label
        return text === 'Message' || /^Message[ ]+[a-zA-Z]+/i.test(ariaLabel);
      });
      
      return !!messageButton;
    `,
  });

  expect(Boolean(messageButtonFound?.result)).toBeTruthy();

  // 4) Click the Message button
  const clickResult = await action({
    action: 'evaluate',
    pageId,
    expression: `
      // Find all buttons on the page
      const buttons = Array.from(document.querySelectorAll('button'));
      
      // Look for button with text "Message" or aria-label "Message [Name]"
      const messageButton = buttons.find(btn => {
        const text = (btn.textContent || btn.innerText || '').trim();
        const ariaLabel = btn.getAttribute('aria-label') || '';
        // Match exact "Message" text or "Message [Name]" in aria-label
        return text === 'Message' || /^Message[ ]+[a-zA-Z]+/i.test(ariaLabel);
      });
      
      if (messageButton) {
        messageButton.click();
        return { 
          success: true, 
          buttonText: messageButton.textContent || messageButton.innerText,
          ariaLabel: messageButton.getAttribute('aria-label')
        };
      }
      
      return { success: false, error: 'Message button not found' };
    `,
  });

  expect(Boolean(clickResult?.result?.success)).toBeTruthy();
  
  // Verify we successfully clicked the Message button
  expect(clickResult?.result?.buttonText?.trim()).toBe('Message');
  expect(clickResult?.result?.ariaLabel).toMatch(/^Message[ ]+[a-zA-Z]+/i);

  // Wait for message chat popup to appear
  await new Promise(r => setTimeout(r, 2000));

  // Fill in the message and send it
  await action({
    action: 'evaluate',
    pageId,
    expression: `
      const textbox = document.querySelector('div[role="textbox"][aria-label*="Write a message"]');
      if (textbox) {
        textbox.click();
        textbox.focus();
        textbox.innerHTML = '<p>Test </p>';
        textbox.dispatchEvent(new Event('input', { bubbles: true }));
        return { success: true, message: 'Message filled' };
      }
      return { success: false, error: 'Message textbox not found' };
    `,
  });

  // Wait a moment for the message input to be processed
  await new Promise(r => setTimeout(r, 500));

  // Click the Send button with improved detection
  const sendResult = await action({
    action: 'evaluate',
    pageId,
    expression: `
      // Try multiple selectors for the Send button
      const sendButton = 
        // Try exact text match first
        Array.from(document.querySelectorAll('button')).find(btn => 
          (btn.textContent || btn.innerText || '').trim() === 'Send'
        ) ||
        // Try aria-label containing 'Send'
        Array.from(document.querySelectorAll('button')).find(btn => 
          (btn.getAttribute('aria-label') || '').toLowerCase().includes('send')
        ) ||
        // Try data-control-name or other LinkedIn-specific attributes
        document.querySelector('button[data-control-name*="send"]') ||
        // Try class names that might contain 'send'
        Array.from(document.querySelectorAll('button')).find(btn => 
          btn.className.toLowerCase().includes('send')
        );
      
      if (sendButton) {
        // Ensure button is visible and enabled
        if (sendButton.offsetParent === null) {
          return { success: false, error: 'Send button is not visible' };
        }
        if (sendButton.disabled) {
          return { success: false, error: 'Send button is disabled' };
        }
        
        // Click the button
        sendButton.click();
        
        // Verify the button state changed or message was sent
        return { 
          success: true, 
          message: 'Send button clicked successfully',
          buttonText: sendButton.textContent || sendButton.innerText,
          ariaLabel: sendButton.getAttribute('aria-label'),
          className: sendButton.className
        };
      }
      
      // Debug: List all buttons to help identify the issue
      const allButtons = Array.from(document.querySelectorAll('button')).map(btn => ({
        text: (btn.textContent || btn.innerText || '').trim(),
        ariaLabel: btn.getAttribute('aria-label'),
        className: btn.className,
        disabled: btn.disabled,
        visible: btn.offsetParent !== null
      }));
      
      return { 
        success: false, 
        error: 'Send button not found',
        availableButtons: allButtons.slice(0, 10) // Limit to first 10 for debugging
      };
    `,
  });

  // Verify the send button was clicked successfully
  expect(Boolean(sendResult?.result?.success)).toBeTruthy();
  
  // Wait 3 seconds for the message to be sent and processed
  await new Promise(r => setTimeout(r, 3000));

  // 5) Cleanup this page
  await action({ action: 'closePage', pageId });
});