import { expect, test } from '@playwright/test';
import { AUTH_FILES, E2E_TICKETS, openTicketByTitle } from './fixtures';

test.use({ storageState: AUTH_FILES.agent });

test('agent ticketı üstlenip pending yapabilmeli ve makro uygulayabilmeli', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Operasyon Araçları' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'İşletim Kuralları' })).not.toBeVisible();

  await openTicketByTitle(page, E2E_TICKETS.agentWorkflow.title);
  await page.getByRole('button', { name: 'Üstlen' }).click();
  await expect(
    page.locator('span').filter({ hasText: /^Ajan: E2E Agent$/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Beklemeye Al' }).click();
  const pendingDialog = page.getByRole('dialog', { name: "Ticket'ı Beklemeye Al" });
  const pendingDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  await pendingDialog.getByLabel('Tekrar Gündeme Gelme Tarihi').fill(pendingDate);
  await pendingDialog.getByLabel('Bekleme Nedeni').fill('E2E müşteriden bilgi bekleniyor');
  await pendingDialog.getByRole('button', { name: 'Beklemeye Al' }).click();

  await expect(pendingDialog).not.toBeVisible();
  await expect(page.getByText('Bekleme nedeni: E2E müşteriden bilgi bekleniyor')).toBeVisible();

  await page.getByLabel('Makro seç').selectOption({ label: 'E2E Önceliklendir ve Yanıtla' });
  await page.getByRole('button', { name: 'Makroyu Uygula' }).click();
  const macroDialog = page.getByRole('dialog', { name: 'Makroyu Uygula' });
  await macroDialog.getByRole('button', { name: 'Uygula' }).click();

  await expect(macroDialog).not.toBeVisible();
  await expect(page.getByText(/E2E-2 öncelikli incelemeye alındı/)).toBeVisible();
  await expect(page.getByText(/E2E Önceliklendir ve Yanıtla.*makrosunu uyguladı/)).toBeVisible();
});
