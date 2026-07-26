import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { AUTH_FILES, E2E_USERS } from './fixtures';

test('admin, agent ve customer oturumlarını hazırla', async ({ browser, baseURL }) => {
  fs.mkdirSync(path.dirname(AUTH_FILES.admin), { recursive: true });

  const accounts = [
    { user: E2E_USERS.admin, path: AUTH_FILES.admin, expectedPath: '/dashboard' },
    { user: E2E_USERS.agent, path: AUTH_FILES.agent, expectedPath: '/dashboard' },
    { user: E2E_USERS.customer, path: AUTH_FILES.customer, expectedPath: '/tickets' },
  ];

  for (const account of accounts) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel('E-posta').fill(account.user.email);
    await page.getByLabel('Şifre').fill(account.user.password);
    await page.getByRole('button', { name: 'Giriş Yap' }).click();
    await expect(page).toHaveURL(new RegExp(`${account.expectedPath}$`));
    await context.storageState({ path: account.path });
    await context.close();
  }
});
