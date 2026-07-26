import { expect, test } from '@playwright/test';
import { AUTH_FILES, E2E_TICKETS, openTicketByTitle } from './fixtures';

test.use({ storageState: AUTH_FILES.admin });

test('admin kapalı ticketı neden belirterek yeniden açabilmeli', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Operasyon Araçları' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'İşletim Kuralları' })).toBeVisible();

  await openTicketByTitle(page, E2E_TICKETS.lifecycle.title);
  await page.getByRole('button', { name: 'Aç', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Çözüldü' })).toBeVisible();
  await page.getByRole('button', { name: 'Çözüldü' }).click();
  await expect(page.getByRole('button', { name: 'Kapat' })).toBeVisible();
  await page.getByRole('button', { name: 'Kapat' }).click();
  await expect(page.getByRole('button', { name: 'Yeniden Aç' })).toBeVisible();

  await page.getByRole('button', { name: 'Yeniden Aç' }).click();
  const dialog = page.getByRole('dialog', { name: "Kapalı Ticket'ı Yeniden Aç" });
  await dialog.getByLabel('Yeniden Açma Nedeni').fill('E2E yeniden inceleme gerekiyor');
  await dialog.getByRole('button', { name: 'Yeniden Aç' }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Yeniden Açılma:')).toBeVisible();
  await expect(page.getByText('Neden: E2E yeniden inceleme gerekiyor')).toBeVisible();
});
