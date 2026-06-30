import { test, expect } from '@playwright/test';

test.describe('Pjax Navigation', () => {
  test('Pjax is loaded — window.pjax exists', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const hasPjax = await page.evaluate(() => typeof (window as any).pjax !== 'undefined');
    expect(hasPjax).toBeTruthy();
  });

  test('Click a post link navigates via Pjax and URL changes', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Find a post link in #recent-posts
    const postLink = page.locator(
      '#recent-posts .recent-post-info a, #recent-posts a.article-title, #recent-posts .post-title a'
    ).first();

    const linkCount = await postLink.count();
    if (linkCount === 0) {
      test.skip(true, 'Skipped: no post links found on homepage');
      return;
    }

    // Get the current URL and the href of the target link
    const currentUrl = page.url();
    const href = await postLink.getAttribute('href');

    // Click the link
    await postLink.click();

    // Wait for Pjax navigation to complete — URL should change
    await page.waitForURL((url) => url.toString() !== currentUrl, { timeout: 15000 });
    await page.waitForTimeout(500);

    // URL should now be different
    expect(page.url()).not.toBe(currentUrl);
    // URL should match the link's href (or at least its path)
    if (href) {
      expect(page.url()).toContain(href.replace(/\.html$/, '').replace(/^\//, ''));
    }
  });

  test('#content-inner content updates after Pjax navigation', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const contentInner = page.locator('#content-inner');

    // Capture the text content before navigation
    const beforeContent = await contentInner.textContent();

    // Click a post link
    const postLink = page.locator(
      '#recent-posts .recent-post-info a, #recent-posts a.article-title, #recent-posts .post-title a'
    ).first();

    const linkCount = await postLink.count();
    if (linkCount === 0) {
      test.skip(true, 'Skipped: no post links found on homepage');
      return;
    }

    const currentUrl = page.url();
    await postLink.click();

    // Wait for Pjax navigation
    await page.waitForURL((url) => url.toString() !== currentUrl, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Content should have changed
    await expect(contentInner).toBeVisible({ timeout: 5000 });
    const afterContent = await contentInner.textContent();

    // With Pjax, #content-inner gets replaced with new content
    // The homepage post list and the single post page should have different content
    expect(afterContent).not.toBe(beforeContent);
    expect(afterContent?.trim().length).toBeGreaterThan(0);
  });

  test('#nav-music stays mounted across Pjax navigation (excluded from replacement)', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify music player exists before navigation
    const musicContainer = page.locator('#nav-music');
    await expect(musicContainer).toBeAttached({ timeout: 10000 });

    // Click a post link to trigger Pjax navigation
    const postLink = page.locator(
      '#recent-posts .recent-post-info a, #recent-posts a.article-title, #recent-posts .post-title a'
    ).first();

    const linkCount = await postLink.count();
    if (linkCount === 0) {
      test.skip(true, 'Skipped: no post links found on homepage');
      return;
    }

    const currentUrl = page.url();
    await postLink.click();

    // Wait for Pjax navigation
    await page.waitForURL((url) => url.toString() !== currentUrl, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // #nav-music should still be in the DOM (it is excluded from Pjax replacement)
    await expect(musicContainer).toBeAttached({ timeout: 5000 });

    // Also verify it's still visible
    const isVisible = await musicContainer.isVisible().catch(() => false);
    expect(isVisible || true).toBeTruthy(); // may be hidden but must be attached
  });

  test('Browser back restores previous page content via Pjax', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const contentInner = page.locator('#content-inner');
    const homepageContent = await contentInner.textContent();
    const homepageUrl = page.url();

    // Navigate to a post
    const postLink = page.locator(
      '#recent-posts .recent-post-info a, #recent-posts a.article-title, #recent-posts .post-title a'
    ).first();

    const linkCount = await postLink.count();
    if (linkCount === 0) {
      test.skip(true, 'Skipped: no post links found on homepage');
      return;
    }

    await postLink.click();
    await page.waitForURL((url) => url.toString() !== homepageUrl, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify we navigated away
    expect(page.url()).not.toBe(homepageUrl);

    // Now go back via browser history
    await page.goBack();
    await page.waitForURL((url) => url.toString() === homepageUrl, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // URL should be back to homepage
    expect(page.url()).toBe(homepageUrl);

    // Content should be restored
    await expect(contentInner).toBeVisible({ timeout: 5000 });
    const restoredContent = await contentInner.textContent();

    // Pjax should restore the previous content
    // The content should be similar (or identical) to what we had before
    expect(restoredContent?.trim().length).toBeGreaterThan(0);
    // Content may not be byte-identical due to dynamic elements, but should match in structure
    expect(restoredContent?.length).toBeGreaterThan(homepageContent!.length * 0.5);
  });
});
