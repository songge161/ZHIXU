import { test, expect } from '@playwright/test';

test('direction picker supports search, keyboard selection, dismissal and modal focus', async ({ page }) => {
  await page.goto('/planner/today');
  await page.getByRole('button', { name: '添加行动', exact: true }).click();
  const picker = page.getByLabel('所属方向');
  await picker.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('combobox', { name: '搜索方向' })).toBeFocused();
  await page.getByRole('combobox', { name: '搜索方向' }).fill('不存在的方向');
  await expect(page.getByRole('status')).toContainText('没有匹配');
  await page.getByRole('combobox', { name: '搜索方向' }).fill('论文');
  await page.keyboard.press('Enter');
  await expect(picker).toHaveAttribute('data-value', 'paper');
  await expect(picker).toBeFocused();
  await picker.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await expect(picker).toBeFocused();
  await picker.click();
  await page.getByLabel('行动内容').click();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await picker.click();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('推进方式')).toBeFocused();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('picker fits mobile viewport and scrolls through a long hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/planner');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    for (let n = 0; n < 24; n++) state.spaces.push({ ...state.spaces[0], id: `branch-${n}`, parentId: 'research', kind: 'branch', title: `分支 ${n}：较长的方向名称用于确认层级和排版` });
  });
  await page.goto('/planner/ai?scope=research');
  await page.getByLabel('跟进范围').click();
  const panel = page.locator('.picker-panel');
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.getByRole('combobox', { name: '搜索方向' }).fill('分支 23');
  await page.getByRole('option', { name: /分支 23/ }).click();
  await expect(page.getByLabel('跟进范围')).toHaveAttribute('data-value', 'branch-23');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});