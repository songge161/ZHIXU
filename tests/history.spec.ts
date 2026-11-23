import { expect, test } from '@playwright/test';

test('deleting a direction is one reversible change including its actions and schedule', async ({ page }) => {
  await page.goto('/planner');
  await page.getByRole('button', { name: '调整研究生阶段 · 研究能力' }).click();
  await page.getByRole('button', { name: '删除方向', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.goto('/settings');
  const entry = page.locator('details').filter({ hasText: '删除方向 · 研究生阶段' });
  await entry.locator('summary').click();
  await expect(entry).toContainText('删除行动 · 精读一篇文献');
  await expect(entry).toContainText('删除日程 · 精读一篇文献');
  await page.getByRole('button', { name: '撤销最近一次调整' }).click();
  await expect(page.getByText('暂无可撤销的调整。')).toBeVisible();
  await page.reload();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!));
  expect(data.spaces[0].id).toBe('research');
  expect(data.tasks[0].spaceId).toBe('research');
  expect(data.schedule[0].taskId).toBe(data.tasks[0].id);
});

test('stale tab cannot undo over a later saved change', async ({ page, context }) => {
  await page.goto('/planner/reviews');
  await page.getByRole('button', { name: '生成执行小结', exact: true }).click();
  await page.goto('/settings');
  await page.locator('details').filter({ hasText: '新增回顾' }).locator('summary').click();
  const second = await context.newPage();
  await second.goto('/planner/reviews');
  await second.getByRole('button', { name: '生成执行小结', exact: true }).click();
  await expect(second.locator('.review-card')).toHaveCount(2);
  await page.getByRole('button', { name: '撤销最近一次调整' }).click();
  await expect(page.getByRole('alert')).toContainText('另一页面');
  await page.reload();
  await expect(page.locator('details').filter({ hasText: '新增回顾' })).toHaveCount(2);
});

test('history evicts old entries by count and byte size and resets on workspace replacement', async ({ page }) => {
  await page.goto('/settings');
  const result = await page.evaluate(async () => {
    const { state, history, undoAdjustment, clearWorkspace } = await import('/src/state.ts');
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    for (let i = 0; i < 22; i++) {
      state.tasks[0].title = '第' + i + '次调整';
      await tick();
    }
    const count = history.value.length;
    for (let i = 0; i < 4; i++) {
      state.materials[0].excerpt = String(i).repeat(100000);
      await tick();
    }
    const bytes = new Blob([JSON.stringify(history.value)]).size;
    const retained = history.value.length;
    undoAdjustment(history.value[0].id);
    const restored = state.materials[0].excerpt;
    clearWorkspace();
    return { count, bytes, retained, restored: restored === '2'.repeat(100000), cleared: history.value.length };
  });
  expect(result.count).toBe(20);
  expect(result.bytes).toBeLessThanOrEqual(512 * 1024);
  expect(result.retained).toBeLessThan(20);
  expect(result.restored).toBe(true);
  expect(result.cleared).toBe(0);
});