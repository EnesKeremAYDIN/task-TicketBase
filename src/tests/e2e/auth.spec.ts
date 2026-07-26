import { expect, test } from '@playwright/test';
import { E2E_USERS } from './fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('oturumsuz kullanıcı login sayfasına yönlendirilmeli', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('customer giriş yaptıktan sonra kendi menü kapsamını görmeli', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(E2E_USERS.customer.email);
  await page.getByLabel('Şifre').fill(E2E_USERS.customer.password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();

  await expect(page).toHaveURL(/\/tickets$/);
  await expect(page.getByRole('link', { name: 'Ticketler' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Operasyon Araçları' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'İşletim Kuralları' })).not.toBeVisible();
});
