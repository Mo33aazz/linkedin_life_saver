import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';

const SERVER_PORT = Number(process.env.SHARED_BROWSER_PORT || 9333);
const BASE = `http://localhost:${SERVER_PORT}`;
const STATUS_URL = `${BASE}/api/status`;
const ACTION_URL = `${BASE}/api/action`;
const DEV_SERVER_URL = 'http://localhost:5174';

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

async function waitForSelectorEval(
  pageId: string,
  selector: string,
  timeoutMs = 45_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await action({
      action: 'evaluate',
      pageId,
      expression: `!!document.querySelector('${selector}')`,
    });
    if (res?.result) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Helper to extract computed styles from shadow DOM
async function getComputedStyles(pageId: string, selector: string, properties: string[]) {
  const result = await action({
    action: 'evaluate',
    pageId,
    expression: `
      const host = document.getElementById('linkedin-engagement-assistant-root');
      const root = host && host.shadowRoot;
      const element = root && root.querySelector('${selector}');
      if (!element) return null;
      
      const styles = window.getComputedStyle(element);
      const result = {};
      ${JSON.stringify(properties)}.forEach(prop => {
        result[prop] = styles.getPropertyValue(prop);
      });
      return result;
    `,
  });
  return result?.result;
}

// Helper to get element dimensions and positioning
async function getElementMetrics(pageId: string, selector: string) {
  const result = await action({
    action: 'evaluate',
    pageId,
    expression: `
      const host = document.getElementById('linkedin-engagement-assistant-root');
      const root = host && host.shadowRoot;
      const element = root && root.querySelector('${selector}');
      if (!element) return null;
      
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      
      return {
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
        padding: {
          top: styles.paddingTop,
          right: styles.paddingRight,
          bottom: styles.paddingBottom,
          left: styles.paddingLeft
        },
        margin: {
          top: styles.marginTop,
          right: styles.marginRight,
          bottom: styles.marginBottom,
          left: styles.marginLeft
        },
        fontSize: styles.fontSize,
        fontFamily: styles.fontFamily,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
        boxShadow: styles.boxShadow
      };
    `,
  });
  return result?.result;
}

test.describe('UI Consistency Between Dev Server and Extension', () => {
  test('Compare styling between dev server and Chrome extension', async () => {
    test.setTimeout(300_000);

    // Verify shared browser server is running
    const up = await serverUp();
    expect(up).toBeTruthy();

    // Test selectors for key UI elements
    const testSelectors = [
      'h1', // Main heading
      '.sidebar', // Main sidebar container
      'button[data-testid="start-button"]', // Start button
      '.control-group', // Control groups
      'input[type="range"]', // Range inputs
      'textarea', // Text areas
      '.bg-white', // Background elements
      '.text-gray-600', // Text elements
      '.border-gray-200', // Border elements
    ];

    // CSS properties to compare
    const cssProperties = [
      'font-family',
      'font-size',
      'font-weight',
      'color',
      'background-color',
      'border-color',
      'border-width',
      'border-radius',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'box-shadow',
      'text-align',
      'line-height',
    ];

    // 1) Test Extension UI on LinkedIn
    console.log('Testing Extension UI...');
    const pageId = await newTestPageId();
    expect(pageId).toBeTruthy();

    const targetUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
    await action({ 
      action: 'goto', 
      pageId, 
      url: targetUrl, 
      waitUntil: 'domcontentloaded', 
      timeoutMs: 60_000 
    });

    // Wait for extension UI to load
    await waitForSelectorEval(pageId, '#lea-toggle', 45_000);
    await waitForSelectorEval(pageId, '#linkedin-engagement-assistant-root', 45_000);

    // Ensure sidebar is open
    await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
    await new Promise(r => setTimeout(r, 1000)); // Wait for animation
    await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
    await new Promise(r => setTimeout(r, 1000)); // Wait for animation

    // Collect extension UI styles
    const extensionStyles: Record<string, any> = {};
    const extensionMetrics: Record<string, any> = {};

    for (const selector of testSelectors) {
      try {
        const styles = await getComputedStyles(pageId, selector, cssProperties);
        const metrics = await getElementMetrics(pageId, selector);
        
        if (styles) {
          extensionStyles[selector] = styles;
        }
        if (metrics) {
          extensionMetrics[selector] = metrics;
        }
      } catch (error) {
        console.log(`Could not get styles for ${selector} in extension:`, error);
      }
    }

    // 2) Test Dev Server UI
    console.log('Testing Dev Server UI...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const devPage = await context.newPage();

    // Navigate to dev server
    await devPage.goto(DEV_SERVER_URL, { waitUntil: 'domcontentloaded' });
    await devPage.waitForSelector('h1', { timeout: 30000 });

    // Collect dev server UI styles
    const devStyles: Record<string, any> = {};
    const devMetrics: Record<string, any> = {};

    for (const selector of testSelectors) {
      try {
        const element = await devPage.$(selector);
        if (element) {
          const styles: Record<string, string> = {};
          for (const prop of cssProperties) {
            const value = await element.evaluate(
              (el: Element, property: string) => window.getComputedStyle(el as HTMLElement).getPropertyValue(property),
              prop
            ) as string;
            styles[prop] = value;
          }
          devStyles[selector] = styles;

          const metrics = await devPage.evaluate((el: Element) => {
            const rect = el.getBoundingClientRect();
            const styles = window.getComputedStyle(el);
            return {
              width: rect.width,
              height: rect.height,
              x: rect.x,
              y: rect.y,
              padding: {
                top: styles.paddingTop,
                right: styles.paddingRight,
                bottom: styles.paddingBottom,
                left: styles.paddingLeft
              },
              margin: {
                top: styles.marginTop,
                right: styles.marginRight,
                bottom: styles.marginBottom,
                left: styles.marginLeft
              },
              fontSize: styles.fontSize,
              fontFamily: styles.fontFamily,
              color: styles.color,
              backgroundColor: styles.backgroundColor,
              borderRadius: styles.borderRadius,
              boxShadow: styles.boxShadow
            };
          }, element);
          devMetrics[selector] = metrics;
        }
      } catch (error) {
        console.log(`Could not get styles for ${selector} in dev server:`, error);
      }
    }

    await browser.close();

    // 3) Compare styles between extension and dev server
    console.log('Comparing UI consistency...');
    
    const criticalProperties = [
      'font-family',
      'font-size',
      'color',
      'background-color',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'border-radius'
    ];

    const inconsistencies: string[] = [];

    for (const selector of testSelectors) {
      const extStyles = extensionStyles[selector];
      const devStyles_sel = devStyles[selector];

      if (extStyles && devStyles_sel) {
        for (const prop of criticalProperties) {
          const extValue = extStyles[prop];
          const devValue = devStyles_sel[prop];

          // Normalize values for comparison
          const normalizeValue = (val: string) => {
            if (!val) return '';
            // Normalize font families (remove quotes, normalize spacing)
            if (prop === 'font-family') {
              return val.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
            }
            // Normalize colors (convert rgb to hex if needed)
            if (prop.includes('color')) {
              return val.replace(/\s+/g, '').toLowerCase();
            }
            return val.trim();
          };

          const normalizedExt = normalizeValue(extValue);
          const normalizedDev = normalizeValue(devValue);

          if (normalizedExt !== normalizedDev) {
            const inconsistency = `${selector} - ${prop}: Extension='${extValue}' vs DevServer='${devValue}'`;
            inconsistencies.push(inconsistency);
            console.log(`❌ INCONSISTENCY: ${inconsistency}`);
          } else {
            console.log(`✅ CONSISTENT: ${selector} - ${prop}`);
          }
        }
      } else if (extStyles && !devStyles_sel) {
        inconsistencies.push(`${selector}: Present in extension but missing in dev server`);
      } else if (!extStyles && devStyles_sel) {
        inconsistencies.push(`${selector}: Present in dev server but missing in extension`);
      }
    }

    // 4) Report results
    console.log(`\n=== UI CONSISTENCY REPORT ===`);
    console.log(`Total selectors tested: ${testSelectors.length}`);
    console.log(`Extension elements found: ${Object.keys(extensionStyles).length}`);
    console.log(`Dev server elements found: ${Object.keys(devStyles).length}`);
    console.log(`Inconsistencies found: ${inconsistencies.length}`);

    if (inconsistencies.length > 0) {
      console.log(`\nInconsistencies:`);
      inconsistencies.forEach(inc => console.log(`  - ${inc}`));
    }

    // 5) Assertions
    expect(Object.keys(extensionStyles).length).toBeGreaterThan(0);
    expect(Object.keys(devStyles).length).toBeGreaterThan(0);
    
    // Allow some minor inconsistencies but fail if too many
    const maxAllowedInconsistencies = 5;
    expect(inconsistencies.length).toBeLessThanOrEqual(maxAllowedInconsistencies);

    // Cleanup
    await action({ action: 'closePage', pageId });
  });

  test('Verify critical UI elements render consistently', async () => {
    test.setTimeout(180_000);

    const up = await serverUp();
    expect(up).toBeTruthy();

    const pageId = await newTestPageId();
    expect(pageId).toBeTruthy();

    const targetUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
    await action({ 
      action: 'goto', 
      pageId, 
      url: targetUrl, 
      waitUntil: 'domcontentloaded', 
      timeoutMs: 60_000 
    });

    await waitForSelectorEval(pageId, '#lea-toggle', 45_000);
    await waitForSelectorEval(pageId, '#linkedin-engagement-assistant-root', 45_000);

    // Ensure sidebar is open
    await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
    await new Promise(r => setTimeout(r, 1000));
    await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
    await new Promise(r => setTimeout(r, 1000));

    // Test that critical elements are properly styled (not white/unstyled)
    const criticalTests = [
      {
        name: 'Main heading has proper styling',
        selector: 'h1',
        checks: ['font-size', 'font-weight', 'color']
      },
      {
        name: 'Sidebar has background color',
        selector: '.sidebar',
        checks: ['background-color']
      },
      {
        name: 'Buttons have proper styling',
        selector: 'button[data-testid="start-button"]',
        checks: ['background-color', 'color', 'border-radius', 'padding-top']
      },
      {
        name: 'Input elements are styled',
        selector: 'input',
        checks: ['border-color', 'border-width', 'padding-top']
      }
    ];

    for (const test of criticalTests) {
      console.log(`Testing: ${test.name}`);
      
      const styles = await getComputedStyles(pageId, test.selector, test.checks);
      expect(styles).toBeTruthy();

      for (const check of test.checks) {
        const value = styles[check];
        expect(value).toBeTruthy();
        
        // Ensure it's not default/unstyled values
        if (check === 'background-color') {
          expect(value).not.toBe('rgba(0, 0, 0, 0)');
          expect(value).not.toBe('transparent');
        }
        if (check === 'color') {
          expect(value).not.toBe('rgb(0, 0, 0)');
        }
        if (check.includes('padding') || check.includes('margin')) {
          expect(value).not.toBe('0px');
        }
        
        console.log(`  ✅ ${check}: ${value}`);
      }
    }

    await action({ action: 'closePage', pageId });
  });

  test('Verify CSS file generation and loading in production build', async () => {
    test.setTimeout(180_000);

    const up = await serverUp();
    expect(up).toBeTruthy();

    const pageId = await newTestPageId();
    expect(pageId).toBeTruthy();

    const targetUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7368619407989760000/';
    await action({ 
      action: 'goto', 
      pageId, 
      url: targetUrl, 
      waitUntil: 'domcontentloaded', 
      timeoutMs: 60_000 
    });

    await waitForSelectorEval(pageId, '#lea-toggle', 45_000);
    await waitForSelectorEval(pageId, '#linkedin-engagement-assistant-root', 45_000);

    // Ensure sidebar is open
    await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
    await new Promise(r => setTimeout(r, 1000));
    await action({ action: 'click', pageId, selector: '#lea-toggle', timeoutMs: 20_000 });
    await new Promise(r => setTimeout(r, 1000));

    // Test CSS file accessibility and loading
    console.log('Testing CSS file accessibility...');
    
    const cssFileAccessible = await action({
      action: 'evaluate',
      pageId,
      expression: `
        (async () => {
          try {
            const response = await fetch(chrome.runtime.getURL('assets/style.css'));
            return {
              accessible: response.ok,
              status: response.status,
              contentType: response.headers.get('content-type'),
              hasContent: (await response.text()).length > 0
            };
          } catch (error) {
            return {
              accessible: false,
              error: error.message
            };
          }
        })()
      `,
    });

    console.log('CSS file accessibility result:', cssFileAccessible?.result);
    expect(cssFileAccessible?.result?.accessible).toBe(true);
    expect(cssFileAccessible?.result?.hasContent).toBe(true);

    // Test that CSS is properly applied from the external file
    console.log('Testing CSS application from external file...');
    
    const cssApplicationTest = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const host = document.getElementById('linkedin-engagement-assistant-root');
        const root = host && host.shadowRoot;
        const styleElement = root && root.querySelector('style');
        
        if (!styleElement) return { hasStyleElement: false };
        
        const cssContent = styleElement.textContent || '';
        const hasTailwindClasses = cssContent.includes('.bg-white') || cssContent.includes('tailwind');
        const hasCustomStyles = cssContent.includes('sidebar') || cssContent.includes('control-group');
        const contentLength = cssContent.length;
        
        return {
          hasStyleElement: true,
          contentLength,
          hasTailwindClasses,
          hasCustomStyles,
          sampleContent: cssContent.substring(0, 200)
        };
      `,
    });

    console.log('CSS application test result:', cssApplicationTest?.result);
    expect(cssApplicationTest?.result?.hasStyleElement).toBe(true);
    expect(cssApplicationTest?.result?.contentLength).toBeGreaterThan(1000); // Should have substantial CSS content
    expect(cssApplicationTest?.result?.hasTailwindClasses || cssApplicationTest?.result?.hasCustomStyles).toBe(true);

    // Test specific Tailwind classes are working
    const tailwindClassTests = [
      { className: 'bg-white', property: 'background-color', expectedPattern: /rgb\(255,\s*255,\s*255\)|white|#fff/ },
      { className: 'text-gray-600', property: 'color', expectedPattern: /rgb\(75,\s*85,\s*99\)|#4b5563/ },
      { className: 'border-gray-200', property: 'border-color', expectedPattern: /rgb\(229,\s*231,\s*235\)|#e5e7eb/ },
      { className: 'rounded-lg', property: 'border-radius', expectedPattern: /8px|0.5rem/ }
    ];

    for (const testCase of tailwindClassTests) {
      console.log(`Testing Tailwind class: ${testCase.className}`);
      
      const elementWithClass = await action({
        action: 'evaluate',
        pageId,
        expression: `
          const host = document.getElementById('linkedin-engagement-assistant-root');
          const root = host && host.shadowRoot;
          const element = root && root.querySelector('.${testCase.className}');
          
          if (!element) return { found: false };
          
          const styles = window.getComputedStyle(element);
          return {
            found: true,
            value: styles.getPropertyValue('${testCase.property}')
          };
        `,
      });

      if (elementWithClass?.result?.found) {
        const value = elementWithClass.result.value;
        console.log(`  ✅ ${testCase.className} - ${testCase.property}: ${value}`);
        expect(testCase.expectedPattern.test(value)).toBe(true);
      } else {
        console.log(`  ⚠️  Element with class ${testCase.className} not found`);
      }
    }

    // Test CSS loading performance
    console.log('Testing CSS loading performance...');
    
    const performanceTest = await action({
      action: 'evaluate',
      pageId,
      expression: `
        const perfEntries = performance.getEntriesByType('resource');
        const cssEntry = perfEntries.find(entry => entry.name.includes('style.css'));
        
        return {
          cssResourceFound: !!cssEntry,
          loadTime: cssEntry ? cssEntry.duration : null,
          transferSize: cssEntry ? cssEntry.transferSize : null
        };
      `,
    });

    console.log('CSS loading performance:', performanceTest?.result);
    if (performanceTest?.result?.cssResourceFound) {
      expect(performanceTest.result.loadTime).toBeLessThan(5000); // Should load within 5 seconds
    }

    await action({ action: 'closePage', pageId });
  });
});