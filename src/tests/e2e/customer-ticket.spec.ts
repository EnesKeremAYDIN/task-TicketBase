import { expect, test } from '@playwright/test';
import { AUTH_FILES } from './fixtures';

test.use({ storageState: AUTH_FILES.customer });

test('customer ticket oluşturup detay ve geçmiş ekranında görebilmeli', async ({ page }) => {
  const title = `E2E Customer Ticket ${Date.now()}`;

  await page.goto('/tickets');
  await page.getByRole('button', { name: 'Yeni Ticket' }).click();
  await page.getByLabel('Başlık').fill(title);
  await page.getByLabel('Açıklama').fill('Customer uçtan uca test açıklaması');
  await page.getByLabel('Öncelik').selectOption('high');
  await page.getByRole('button', { name: 'Oluştur' }).click();

  await expect(page).toHaveURL(/\/tickets\/[^/]+$/);
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  await page.getByRole('button', { name: 'Geri' }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
});
