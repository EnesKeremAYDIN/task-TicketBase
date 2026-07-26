import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { E2E_TICKETS, E2E_USERS } from '../../../prisma/seed-e2e';

export { E2E_TICKETS, E2E_USERS };

export const AUTH_FILES = {
  admin: path.resolve('playwright/.auth/admin.json'),
  agent: path.resolve('playwright/.auth/agent.json'),
  customer: path.resolve('playwright/.auth/customer.json'),
} as const;

export async function openTicketByTitle(page: Page, title: string) {
  const query = new URLSearchParams({
    queue: 'unassigned',
    q: title,
  });
  await page.goto(`/tickets?${query.toString()}`);
  const ticketLink = page.getByRole('button', { name: new RegExp(title) });
  await expect(ticketLink).toBeVisible();
  await ticketLink.click();
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
}
