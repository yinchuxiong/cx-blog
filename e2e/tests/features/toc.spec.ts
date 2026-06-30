import { test, expect } from '@playwright/test';

test.describe('Table of Contents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
  });

  test('#card-toc TOC widget is visible in sidebar', async ({ page }) => {
    const toc = page.locator('#card-toc');
    await expect(toc).toBeVisible({ timeout: 5000 });
  });

  test('TOC contains links that point to headings in the article', async ({ page }) => {
    const tocLinks = page.locator('#card-toc a');
    const count = await tocLinks.count();
    expect(count).toBeGreaterThan(0);

    // Verify at least one link's href points to an anchor (heading)
    const firstHref = await tocLinks.first().getAttribute('href');
    expect(firstHref).toMatch(/^#/);
  });

  test('click a TOC link scrolls the page to the corresponding heading', async ({ page }) => {
    // Scroll to top first to ensure we have room to scroll
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    const tocLinks = page.locator('#card-toc a');
    const count = await tocLinks.count();
    expect(count).toBeGreaterThan(0);

    // Click the second TOC link (first is often the title which is already at top)
    const targetIndex = count > 1 ? 1 : 0;
    const href = await tocLinks.nth(targetIndex).getAttribute('href');
    expect(href).toBeTruthy();

    // Use JS click since TOC link may be out of viewport in sidebar scroll container
    await page.evaluate((idx) => {
      const links = document.querySelectorAll('#card-toc a');
      if (links[idx]) links[idx].click();
    }, targetIndex);
    await page.waitForTimeout(800); // Wait for smooth scroll to complete

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });
});
