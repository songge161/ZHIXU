import { expect, test } from '@playwright/test';

test('empty workspace starts with a personal direction and an actionable first step', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: '清空浏览器工作区', exact: true }).click();
  await page.getByRole('button', { name: '确认清空工作区' }).click();
  await page.setViewportSize({ width: 360, height: 640 });
  await page.getByRole('button', { name: '创建第一份计划' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '创建方向和行动' })).toBeDisabled();
  await dialog.getByLabel('方向名称').fill('了解身边的植物');
  await dialog.getByLabel('第一个行动').fill('观察一片叶子并写下它的特征');
  await dialog.getByRole('button', { name: '创建方向和行动' }).click();
  await expect(page.getByRole('heading', { name: '了解身边的植物' })).toBeVisible();
  await page.goto('/planner/today');
  await page.getByRole('region', { name: '未排期行动' }).getByLabel('完成：观察一片叶子并写下它的特征').click();
  await page.reload();
  await page.getByRole('button', { name: '查看已完成' }).click();
  await expect(page.getByLabel('完成：观察一片叶子并写下它的特征')).toBeChecked();
});

test('template previews are editable, cancel is read-only, and one undo removes only the added plan', async ({ page }) => {
  await page.goto('/planner');
  await expect(page.getByText('内置示例', { exact: true })).toHaveCount(3);
  const stored = () => page.evaluate(() => localStorage.getItem('edu.prototype.v1.workspace'));
  const before = await stored();
  await page.getByRole('button', { name: '从模板起步' }).click();
  const dialog = page.getByRole('dialog');
  const choose = dialog.getByLabel('起步方式');
  await expect(dialog.getByLabel('方向名称')).toHaveValue('用英语讲清楚一件事');
  await page.setViewportSize({ width: 360, height: 640 });
  expect(await dialog.getByLabel('第一个行动').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await choose.selectOption({ label: '论文写作' });
  await expect(dialog.getByLabel('第一个行动')).toHaveValue(/论文/);
  await choose.selectOption({ label: '每周计划' });
  await dialog.getByLabel('方向名称').fill('我的周计划');
  await choose.selectOption({ label: '自己填写' });
  await choose.selectOption({ label: '每周计划' });
  await expect(dialog.getByLabel('方向名称')).toHaveValue('我的周计划');
  await dialog.getByRole('button', { name: '取消' }).click();
  expect(await stored()).toBe(before);
  await page.getByRole('button', { name: '从模板起步' }).click();
  await choose.selectOption({ label: '每周计划' });
  await dialog.getByLabel('方向名称').fill('我的周计划');
  await dialog.getByRole('button', { name: '创建方向和行动' }).click();
  await expect(page.getByRole('heading', { name: '我的周计划' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.page-heading')).toContainText('来自模板');
  await page.goto('/settings');
  const history = page.locator('details').filter({ hasText: '采用模板 · 每周计划' });
  await history.locator('summary').click();
  await expect(history).toContainText('2 条记录');
  await page.getByRole('button', { name: '撤销最近一次调整' }).click();
  await page.goto('/planner');
  await expect(page.locator('.overview-card')).toHaveCount(3);
  await expect(page.getByText('我的周计划', { exact: true })).toHaveCount(0);
  await expect(page.getByText('内置示例', { exact: true })).toHaveCount(3);
});

test('a full workspace rejects the whole starter plan and keeps the draft', async ({ page }) => {
  await page.goto('/planner');
  await page.evaluate(async () => {
    const { state, replaceWorkspace, validateWorkspace } = await import('/src/state.ts');
    const next = validateWorkspace(state);
    while (next.tasks.length < 500) next.tasks.push({ ...next.tasks[0], id: 'filler-' + next.tasks.length });
    replaceWorkspace(next);
  });
  await page.reload();
  const stored = () => page.evaluate(() => localStorage.getItem('edu.prototype.v1.workspace'));
  const before = await stored();
  await page.getByRole('button', { name: '从模板起步' }).click();
  await page.getByRole('button', { name: '创建方向和行动' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('工作区容量不足');
  await expect(page.getByLabel('方向名称')).toHaveValue('用英语讲清楚一件事');
  expect(await stored()).toBe(before);
});