import { test, expect } from '@playwright/test';

test.describe('About page', () => {
  test('loads and has title containing "关于" or "About"', async ({ page }) => {
    await page.goto('/about/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/关于|About/);
  });

  test('has content area visible', async ({ page }) => {
    await page.goto('/about/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('#content-inner')).toBeVisible();
  });
});

test.describe('Album page', () => {
  test('loads and has title containing "相册" or "Album"', async ({ page }) => {
    await page.goto('/album/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/相册|Album/);
  });
});

test.describe('Music page', () => {
  test('loads and has title containing "音乐" or "Music"', async ({ page }) => {
    await page.goto('/music/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/音乐|Music/);
  });
});

test.describe('AI Hub page', () => {
  test('loads and has title containing "AI"', async ({ page }) => {
    await page.goto('/ai/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/AI/);
  });
});

test.describe('Essay page', () => {
  test('loads and has title containing "说说" or "Essay"', async ({ page }) => {
    await page.goto('/essay/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/闲言碎语|说说|Essay/);
  });
});

test.describe('Bangumi page', () => {
  test('loads and has title containing "番剧" or "Bangumi"', async ({ page }) => {
    await page.goto('/bangumis/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/追番列表|番剧|Bangumi/);
  });
});

test.describe('404 page', () => {
  test('shows for non-existent URL', async ({ page }) => {
    await page.goto('/this-page-does-not-exist/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    // 404 template uses #body-wrap.error and .error_subtitle (not #content-inner)
    const bodyWrap = page.locator('#body-wrap.error');
    const hasError = await bodyWrap.count();
    if (hasError > 0) {
      await expect(bodyWrap.first()).toBeVisible();
    } else {
      // Fallback: check for 404 text anywhere on page
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toMatch(/404|Not Found|页面没找到|抱歉|Cannot GET/);
    }
  });
});
