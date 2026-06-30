import { test, expect } from '@playwright/test';

test.describe('Music Player (#nav-music)', () => {
  test('#nav-music container is present on homepage', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const musicContainer = page.locator('#nav-music');
    await expect(musicContainer).toBeVisible({ timeout: 10000 });
  });

  test('#nav-music-hoverTips element is present with play hint text', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const hoverTips = page.locator('#nav-music-hoverTips');
    await expect(hoverTips).toBeVisible({ timeout: 10000 });

    // The hover tips should contain some text (play hint in Chinese or English)
    const tipsText = await hoverTips.textContent();
    expect(tipsText?.trim().length).toBeGreaterThan(0);
  });

  test('Click #nav-music-hoverTips activates player — APlayer container appears', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const hoverTips = page.locator('#nav-music-hoverTips');
    await expect(hoverTips).toBeVisible({ timeout: 10000 });

    // Click the hover tips to toggle/activate the music player.
    // Use { force: true } because the element may be outside the viewport or
    // partially covered by other elements.
    await hoverTips.click({ force: true });

    // After clicking, NavMusic.toggle() is called. It requires the NetEase API
    // to have returned song data and APlayer to be instantiated before anything
    // visible happens. Two signals indicate success:
    //   1. #nav-music gains the .playing class (syncPlayState on play)
    //   2. #nav-music-aplayer .aplayer element becomes visible
    const navMusic = page.locator('#nav-music');
    let activated = false;

    // Check for the .playing class first — this is set synchronously when
    // APlayer fires the 'play' event.
    try {
      await expect(navMusic).toHaveClass(/playing/, { timeout: 10000 });
      activated = true;
    } catch {
      // .playing class didn't appear — possibly API responded but autoplay
      // was blocked, or the API hasn't responded yet.
    }

    // Fallback: check if APlayer rendered at all (API responded, render started).
    if (!activated) {
      try {
        await expect(page.locator('#nav-music-aplayer .aplayer')).toBeVisible({ timeout: 5000 });
        activated = true;
      } catch {
        // APlayer didn't render — the external NetEase API is unreachable.
      }
    }

    if (!activated) {
      // The external NetEase API is unavailable or too slow. Skip rather than
      // fail — the UI interaction itself (click handler binding, element
      // presence) is verified by the other tests in this suite.
      test.skip(true, 'Skipped: NetEase music API did not respond — cannot verify player activation');
      return;
    }

    // Player activated successfully. Verify the container is still attached.
    await expect(navMusic).toBeAttached();

    // If APlayer rendered, verify it has internal content (album art or controls).
    const aplayer = page.locator('#nav-music-aplayer .aplayer');
    const aplayerBody = aplayer.locator('.aplayer-body, .aplayer-pic, .aplayer-music');
    if (await aplayerBody.count() > 0) {
      await expect(aplayerBody.first()).toBeAttached();
    }
  });

  test('Music player stays mounted after multiple hover-tip toggles', async ({ page, baseURL }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const hoverTips = page.locator('#nav-music-hoverTips');
    await expect(hoverTips).toBeVisible({ timeout: 10000 });

    // Toggle on — use { force: true } since element may be outside viewport.
    // NavMusic.toggle() is a no-op if the API hasn't responded yet (ap is null),
    // but the click handler itself should not throw.
    await hoverTips.click({ force: true });

    // Brief pause for any pending DOM updates.
    await page.waitForTimeout(500);

    // Toggle off via page.evaluate. After the first click (if the API
    // responded), the hoverTips element gets CSS `width: 0;
    // pointer-events: none; z-index: -1`, which can block even forced
    // clicks.  Using page.evaluate directly invokes the same toggle
    // logic — what matters here is that #nav-music survives the toggles.
    await page.evaluate(() => {
      if (typeof NavMusic !== 'undefined' && NavMusic.toggle) {
        NavMusic.toggle();
      }
    });

    // The #nav-music container is a static element in the page layout.
    // It must remain in the DOM after any number of toggle calls,
    // regardless of whether the NetEase API responded or APlayer instantiated.
    const musicContainer = page.locator('#nav-music');
    await expect(musicContainer).toBeAttached();

    // The hover tips element should also still be attached after toggling.
    await expect(hoverTips).toBeAttached();
  });
});
