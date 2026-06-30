import { test, expect } from '@playwright/test';

/**
 * Rightside button tests.
 * Buttons in #rightside-config-hide (readmode, translate, darkmode, hideAside)
 * are collapsed by default (height:0, opacity:0 in CSS), so we use .toBeAttached()
 * to verify they exist in the DOM, and page.evaluate() to click them via JS.
 * Buttons in #rightside-config-show (toc, go-up) are visible and clickable.
 */
test.describe('Rightside Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
  });

  test('#rightside panel is visible on post page', async ({ page }) => {
    const rightside = page.locator('#rightside');
    await expect(rightside).toBeVisible();
  });

  test('#readmode button exists and enters read mode via JS', async ({ page }) => {
    // Button is inside #rightside-config-hide (collapsed), so check attached not visible
    const readmodeBtn = page.locator('#readmode');
    await expect(readmodeBtn).toBeAttached();

    // Click via JS to bypass viewport/hidden-parent restrictions
    await page.evaluate(() => {
      const btn = document.getElementById('readmode');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toHaveClass(/read-mode/);

    // Exit read mode via the dynamically created exit button
    const exitBtn = page.locator('.exit-readmode');
    await expect(exitBtn).toBeVisible();
    await exitBtn.click();
    await expect(page.locator('body')).not.toHaveClass(/read-mode/);
  });

  test('#translateLink button exists in DOM', async ({ page }) => {
    const translateBtn = page.locator('#translateLink');
    await expect(translateBtn).toBeAttached();
  });

  test('#hide-aside-btn exists and toggles sidebar via JS', async ({ page }) => {
    const hideAsideBtn = page.locator('#hide-aside-btn');
    await expect(hideAsideBtn).toBeAttached();

    // Click via JS to toggle sidebar hidden
    await page.evaluate(() => {
      const btn = document.getElementById('hide-aside-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);
    await expect(page.locator('html')).toHaveClass(/hide-aside/);

    // Click again to show sidebar
    await page.evaluate(() => {
      const btn = document.getElementById('hide-aside-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);
    await expect(page.locator('html')).not.toHaveClass(/hide-aside/);
  });

  test('#go-up button scrolls back to top', async ({ page }) => {
    // go-up is in #rightside-config-show, should be visible
    const goUpBtn = page.locator('#go-up');
    await expect(goUpBtn).toBeAttached();

    // Scroll down 500px
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);
    const scrollYAfterScroll = await page.evaluate(() => window.scrollY);
    expect(scrollYAfterScroll).toBeGreaterThan(400);

    // Click go-up button via JS
    await page.evaluate(() => {
      const btn = document.getElementById('go-up');
      if (btn) btn.click();
    });
    await page.waitForTimeout(800); // Wait for smooth scroll

    const scrollYAfterClick = await page.evaluate(() => window.scrollY);
    expect(scrollYAfterClick).toBeLessThan(100);
  });

  test('#mobile-toc-button is present in DOM', async ({ page }) => {
    const mobileTocBtn = page.locator('#mobile-toc-button');
    await expect(mobileTocBtn).toBeAttached();
  });
});
