import { expect, type Page } from '@playwright/test';

/** The adopted action view keeps the relative rail diagram behind an explicit disclosure. */
export async function openTimelineDiagram(page: Page) {
  const panel = page.locator('details').filter({ has: page.locator('summary', { hasText: '時刻表の流れを見る' }) });
  await expect(panel).toHaveCount(1);
  if (!(await panel.evaluate(element => (element as HTMLDetailsElement).open))) await panel.locator('summary').click();
  await expect(page.locator('.rail-scene')).toBeVisible();
  await expect(page.locator('.rail-disclaimer')).toContainText('実位置ではありません');
}
