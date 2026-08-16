import { expect, test } from '@playwright/test';

/**
 * Foundations E2E smoke test.
 *
 * Proves the Playwright harness actually runs against a built app. Verticals
 * add their own specs alongside this one — Vitest excludes tests/e2e/ so the
 * two runners never collide.
 */

test('home page renders', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});

test('skip link is the first keyboard stop', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});

test('unknown routes render the 404 page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText("couldn't find that page");
});

test('protected routes redirect signed-out visitors to login', async ({ page }) => {
  for (const path of ['/write', '/reading-list', '/settings']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2F${path.slice(1)}`));
  }
});
