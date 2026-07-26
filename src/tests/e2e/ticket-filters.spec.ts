import { expect, test } from '@playwright/test';
import { AUTH_FILES } from './fixtures';

test.use({ storageState: AUTH_FILES.agent });

test('filtreler URL içinde korunmalı ve arama debounce edilmeli', async ({ page }) => {
  await page.goto('/tickets');
  await page.getByRole('button', { name: 'Atanmamış ve Açık' }).click();
  await expect(page).toHaveURL(/queue=unassigned/);

  await page.getByLabel('Durum filtresi').selectOption('open');
  await page.getByLabel('Öncelik filtresi').selectOption('normal');
  await page.getByLabel('Kategori filtresi').selectOption('Donanım');

  let searchRequestCount = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/tickets' && url.searchParams.has('search')) {
      searchRequestCount += 1;
    }
  });

  await page.getByLabel('Ticket ara').pressSequentially('E2E Agent', { delay: 20 });
  await expect(page).toHaveURL(/q=E2E\+Agent/);
  await expect.poll(() => searchRequestCount).toBe(1);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Atanmamış ve Açık' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Durum filtresi')).toHaveValue('open');
  await expect(page.getByLabel('Öncelik filtresi')).toHaveValue('normal');
  await expect(page.getByLabel('Kategori filtresi')).toHaveValue('Donanım');
  await expect(page.getByLabel('Ticket ara')).toHaveValue('E2E Agent');
});

test('mobil görünüm ana sayfada yatay taşma oluşturmamalı', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
