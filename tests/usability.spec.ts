import { test, expect } from '@playwright/test';

test('beginner journey: create a direction and an undated action, find it in daily work and finish it', async ({ page }) => {
  await page.goto('/');
  await page.locator('.portal-intro').getByRole('link', { name: /打开我的学习规划/ }).click();
  await page.getByRole('button', { name: '新建大方向', exact: true }).click();
  await page.getByLabel('方向名称').fill('我的英语学习');
  await page.getByRole('button', { name: '创建大方向', exact: true }).click();
  await page.getByRole('link', { name: '查看方向：我的英语学习' }).click();
  await expect(page.getByText('推进记录', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '添加第一个行动' }).click();
  await page.getByLabel('行动内容').fill('读一篇短文章并写下三个新表达');
  await page.getByRole('button', { name: '加入计划' }).click();
  await expect(page.locator('.detail-actions-list')).toContainText('读一篇短文章并写下三个新表达');
  await page.goto('/planner/today');
  await expect(page.getByRole('heading', { name: /未排期行动/ })).toBeVisible();
  await page.screenshot({ path: 'output/usability-novice-today.png', fullPage: true });
  await page.getByRole('checkbox', { name: '完成：读一篇短文章并写下三个新表达', exact: true }).click();
  await page.reload();
  await page.goto('/planner');
  await page.getByRole('link', { name: '查看方向：我的英语学习' }).click();
  await expect(page.getByRole('checkbox', { name: '完成：读一篇短文章并写下三个新表达', exact: true })).toBeChecked();
});

test('ordinary-user journey: find the next action, record progress, attach evidence and finish', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/planner');
  await page.getByRole('link', { name: '查看方向：研究生阶段 · 研究能力' }).click();
  const tools = page.locator('.detail-tool-section');
  expect(await tools.locator(':scope[open]').count()).toBe(0);
  const action = page.locator('.detail-actions-list');
  await expect(action.getByText('精读一篇文献，记录核心问题与方法', { exact: true })).toBeVisible();
  await page.getByText('行动状态与完成条件', { exact: true }).click();
  await page.getByLabel('精读一篇文献，记录核心问题与方法的执行状态').selectOption('in_progress');
  await page.getByText('推进记录', { exact: true }).click();
  await page.getByText('新增一次推进记录', { exact: true }).click();
  await page.getByLabel('精读一篇文献，记录核心问题与方法的本次推进').fill('读完摘要，整理了两个关键问题。');
  await page.getByRole('button', { name: '保存本次记录' }).click();
  await page.getByText('关联学习资料', { exact: true }).click();
  await page.getByRole('checkbox', { name: /文献阅读笔记\.md/ }).check();
  await action.getByRole('checkbox', { name: '完成：精读一篇文献，记录核心问题与方法' }).check();
  await page.reload();
  await expect(action.getByRole('checkbox')).toBeChecked();
  await page.getByText('推进记录', { exact: true }).click();
  await expect(page.getByText('读完摘要，整理了两个关键问题。', { exact: true })).toBeVisible();
  await page.getByText('关联学习资料', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /文献阅读笔记\.md/ })).toBeChecked();
  await page.screenshot({ path: 'output/usability-ordinary-expanded.png', fullPage: true });
});

test('long names and a short laptop viewport keep creation and editing usable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/planner');
  const title = '每周学习与生活安排'.repeat(10);
  const task = '阅读与复盘'.repeat(30);
  await page.getByRole('button', { name: '新建大方向', exact: true }).click();
  await page.getByLabel('方向名称').fill(title);
  await page.getByRole('button', { name: '创建大方向', exact: true }).click();
  await page.getByRole('link', { name: `查看方向：${title}`, exact: true }).click();
  await page.getByRole('button', { name: '添加第一个行动', exact: true }).click();
  await page.getByLabel('行动内容').fill(task);
  await page.getByRole('button', { name: '加入计划', exact: true }).click();
  for (const width of [1024, 820, 390]) {
    await page.setViewportSize({ width, height: 600 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: `调整行动：${task}`, exact: true }).click();
  await page.getByLabel('行动内容').fill('缩短成清晰的一步');
  await page.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(page.locator('.detail-actions-list')).toContainText('缩短成清晰的一步');
});

for (const width of [360, 390, 768, 820, 1024, 1280, 1440, 1920]) {
  test(`layout at ${width}px: common routes, calendar and action editor fit`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 820 ? 844 : 800 });
    for (const path of ['/', '/planner', '/planner/spaces/research', '/planner/today', '/planner/materials', '/planner/reviews', '/planner/ai', '/settings', '/planner/schedule']) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: `${path} at ${width}px` }).toBeLessThanOrEqual(1);
    }
    await page.getByRole('button', { name: '周视图', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: '月视图', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.goto('/planner/today');
    await page.getByRole('button', { name: '添加行动', exact: true }).click();
    await page.getByLabel('行动内容').fill('先完成一小步');
    const dialog = page.getByRole('dialog');
    const rect = await dialog.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    expect(rect!.height).toBeLessThanOrEqual(width <= 820 ? 844 : 800);
    await page.getByRole('button', { name: '加入计划' }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto('/planner/spaces/research');
    await page.screenshot({ path: `output/usability-detail-${width}.png`, fullPage: true });
  });
}