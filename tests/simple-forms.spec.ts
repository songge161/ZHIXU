import { test, expect } from '@playwright/test';

test('new direction starts simply, optional settings survive collapse, saving and reopening', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/planner');
  await page.getByRole('button', { name: '新建大方向', exact: true }).click();
  await expect(page.getByLabel('节点类型')).toBeHidden();
  await expect(page.getByLabel('完成标准（可留空）')).toBeHidden();
  await expect(page.getByRole('region', { name: '调整影响预览' })).toHaveCount(0);
  await page.getByLabel('方向名称').fill('生活与学习安排');
  const planning = page.getByRole('dialog').locator('.planning-settings > summary');
  await planning.click();
  await page.getByLabel('节点类型').selectOption('project');
  await page.getByLabel('在上级中的分量（1-100）').fill('40');
  await page.getByLabel('卡片颜色').selectOption('sand');
  await planning.click();
  const criteria = page.getByText('阶段目标与完成标准（选填）', { exact: true });
  await criteria.click();
  await page.getByLabel('完成标准（可留空）').fill('完成一份适合自己的每周安排');
  await criteria.click();
  await page.screenshot({ path: 'output/simple-direction-form.png' });
  await page.getByRole('button', { name: '创建大方向', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '调整生活与学习安排', exact: true }).click();
  await expect(page.getByLabel('节点类型')).toHaveValue('project');
  await expect(page.getByLabel('在上级中的分量（1-100）')).toHaveValue('40');
  await expect(page.getByLabel('卡片颜色')).toHaveValue('sand');
  await expect(page.getByLabel('完成标准（可留空）')).toHaveValue('完成一份适合自己的每周安排');
});

test('new action keeps optional notes out of the way without losing a note on collapse', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/planner/today');
  await page.getByRole('button', { name: '添加行动', exact: true }).click();
  await expect(page.getByLabel('完成证据 / 工作记录')).toBeHidden();
  await expect(page.getByRole('region', { name: '调整影响预览' })).toHaveCount(0);
  await page.getByLabel('行动内容').fill('写一段阅读心得');
  await page.getByText('工作记录与文件（选填）', { exact: true }).click();
  await page.getByLabel('完成证据 / 工作记录').fill('留下一段自己的理解与一个问题。');
  await page.getByText('工作记录与文件（选填）', { exact: true }).click();
  await page.screenshot({ path: 'output/simple-action-form-mobile.png' });
  await page.getByRole('button', { name: '加入计划', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '调整行动：写一段阅读心得', exact: true }).click();
  await expect(page.getByLabel('完成证据 / 工作记录')).toBeVisible();
  await expect(page.getByLabel('完成证据 / 工作记录')).toHaveValue('留下一段自己的理解与一个问题。');
});