import { expect, test } from '@playwright/test';
import { E2E_USERS } from './fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('sistem teması işletim sisteminin koyu tercihini takip etmeli', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');

  await expect(page.getByLabel('Renk teması')).toHaveValue('system');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect
    .poll(() => page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(243, 244, 246)');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() => page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(7, 17, 26)');
});

test('koyu tema yenileme, giriş ve çıkış boyunca korunmalı', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Renk teması').selectOption('dark');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByLabel('Renk teması')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByLabel('E-posta').fill(E2E_USERS.customer.email);
  await page.getByLabel('Şifre').fill(E2E_USERS.customer.password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  await expect(page.getByLabel('Renk teması')).toHaveValue('dark');

  await page.getByRole('button', { name: 'Çıkış' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Renk teması')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('açık tema sistem koyu olsa bile açık renkleri kullanmalı ve mobilde taşmamalı', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Renk teması').selectOption('light');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(243, 244, 246)');

  const pageMetrics = await page.evaluate(() => {
    function luminance(rgb: string) {
      const channels = rgb.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
      const normalized = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2];
    }

    const bodyStyle = getComputedStyle(document.body);
    const foreground = luminance(bodyStyle.color);
    const background = luminance(bodyStyle.backgroundColor);
    const contrast = (Math.max(foreground, background) + 0.05)
      / (Math.min(foreground, background) + 0.05);

    return {
      contrast,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  expect(pageMetrics.contrast).toBeGreaterThanOrEqual(4.5);
  expect(pageMetrics.hasHorizontalOverflow).toBe(false);
});

test('tema tercihi aynı tarayıcıdaki sekmeler arasında eşitlenmeli', async ({
  context,
  page,
}) => {
  await page.goto('/login');
  const secondPage = await context.newPage();
  await secondPage.goto('/login');

  await page.getByLabel('Renk teması').selectOption('dark');

  await expect(secondPage.getByLabel('Renk teması')).toHaveValue('dark');
  await expect(secondPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  await secondPage.close();
});
