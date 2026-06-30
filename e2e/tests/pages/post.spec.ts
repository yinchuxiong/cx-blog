import { test, expect } from '@playwright/test';

test.describe('Post Page', () => {
  test('Post page loads (/posts/hello-world.html)', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('#body-wrap')).toBeVisible();
  });

  test('Page title contains post title "Hello World"', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/Hello World/);
  });

  test('Post content (#article-container) is visible', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const articleContainer = page.locator('#article-container');
    await expect(articleContainer).toBeVisible();
  });

  test('Post has category metadata', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const categoryMeta = page.locator('.post-meta-categories, .article-category, .post-category').first();
    // At least one category metadata element should be present
    await expect(categoryMeta).toBeVisible({ timeout: 5000 });
  });

  test('Copyright notice section renders', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const copyright = page.locator('.post-copyright');
    await expect(copyright).toBeVisible();
  });

  test('TOC widget (#card-toc) is present', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const toc = page.locator('#card-toc');
    await expect(toc).toBeVisible({ timeout: 5000 });
  });

  test('Footer renders', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const footer = page.locator('#footer');
    await expect(footer).toBeVisible();
  });

  test('Right-side panel is present', async ({ page, baseURL }) => {
    await page.goto('/posts/hello-world.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const rightside = page.locator('#rightside');
    await expect(rightside).toBeVisible();
  });
});
