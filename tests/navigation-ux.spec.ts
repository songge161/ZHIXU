import { test, expect } from '@playwright/test';

test('mobile drawer isolates background and restores focus on dismissal and navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await page.goto('/planner');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主内容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const menu = page.getByRole('button', { name: '打开导航' });
  await menu.click();
  await expect(page.getByRole('button', { name: '关闭导航' })).toBeFocused();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.main-shell'))).toBe(false);
  }
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await expect(page).toHaveTitle('设置 · 知序');
  await expect(menu).toBeFocused();
  await expect(page.locator('.sidebar')).toHaveJSProperty('inert', true);
});

test('validation explains missing direction title and cancelled or undone deletion preserves it', async ({ page }) => {
  await page.goto('/planner');
  await page.getByRole('button', { name: '新建大方向' }).click();
  await page.getByRole('button', { name: '创建大方向' }).click();
  await expect(page.getByRole('alert')).toContainText('请填写方向名称');
  await page.getByLabel('方向名称').fill('练习计划');
  await page.getByRole('button', { name: '创建大方向' }).click();
  await page.getByRole('button', { name: '调整练习计划' }).click();
  await page.getByRole('button', { name: '删除方向' }).click();
  await page.getByRole('dialog', { name: '确认删除' }).getByRole('button', { name: '取消' }).click();
  await expect(page.getByLabel('方向名称')).toHaveValue('练习计划');
  await page.getByRole('button', { name: '删除方向' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '练习计划' })).toHaveCount(0);
  await page.getByRole('button', { name: '撤销删除' }).click();
  await expect(page.getByRole('heading', { name: '练习计划' })).toBeVisible();
});
