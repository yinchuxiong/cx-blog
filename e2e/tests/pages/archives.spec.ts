import { test, expect } from '@playwright/test';

test.describe('Archives page', () => {
  test('loads and has title containing "归档" or "Archives"', async ({ page }) => {
    await page.goto('/archives/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/归档|Archives/);
  });

  test('has content area visible', async ({ page }) => {
    await page.goto('/archives/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('#content-inner')).toBeVisible();
  });

  test('has footer and rightside panel', async ({ page }) => {
    await page.goto('/archives/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('#footer')).toBeVisible();
    await expect(page.locator('#rightside')).toBeVisible();
  });
});

test.describe('Categories page', () => {
  test('loads and has title containing "分类" or "Categories"', async ({ page }) => {
    await page.goto('/categories/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/分类|Categories/);
  });

  test('has content area visible', async ({ page }) => {
    await page.goto('/categories/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('#content-inner')).toBeVisible();
  });
});

test.describe('Tags page', () => {
  test('loads and has title containing "标签" or "Tags"', async ({ page }) => {
    await page.goto('/tags/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(/标签|Tags/);
  });

  test('has content area visible', async ({ page }) => {
    await page.goto('/tags/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('#content-inner')).toBeVisible();
  });
});
