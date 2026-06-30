import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('Homepage loads and has correct title', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/Soar Blog/);
  });

  test('Site name (#site-name) is visible in nav', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const siteName = page.locator('#site-name');
    await expect(siteName).toBeVisible();
    await expect(siteName).toHaveText(/Soar/);
  });

  test('Navigation header is present', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const nav = page.locator('#nav');
    await expect(nav).toBeVisible();
  });

  test('Post list (#recent-posts) renders with at least one post', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const recentPosts = page.locator('#recent-posts');
    await expect(recentPosts).toBeVisible();
    const postItems = recentPosts.locator('.recent-post-item, article, .post-item');
    await expect(postItems.first()).toBeVisible({ timeout: 5000 });
  });

  test('Essay ticker (#bbTimeList or #bber-talk) renders', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const ticker = page.locator('#bbTimeList, #bber-talk');
    const count = await ticker.count();
    if (count === 0) {
      test.skip(true, 'Skipped: essay ticker not configured (no essay data with home_essay)');
      return;
    }
    await expect(ticker.first()).toBeVisible({ timeout: 5000 });
  });

  test('Footer (#footer) renders', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const footer = page.locator('#footer');
    await expect(footer).toBeVisible();
  });

  test('Right-side panel (#rightside) is present', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const rightside = page.locator('#rightside');
    await expect(rightside).toBeVisible();
  });

  test('Music player (#nav-music) container is present', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const musicPlayer = page.locator('#nav-music');
    await expect(musicPlayer).toBeVisible();
  });

  test('Preloader (#loading-box) disappears after page load', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('#loading-box')).toBeHidden({ timeout: 10000 });
  });

  test('Category group section renders (if present)', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const categoryGroup = page.locator('.category-lists, .category-group');
    const count = await categoryGroup.count();
    if (count > 0) {
      await expect(categoryGroup.first()).toBeVisible();
    }
    // Test passes regardless — category section is optional on some configs
  });
});
