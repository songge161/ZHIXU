import { test, expect } from '@playwright/test';

test('queues partition actions, filter branches and titles, and expand long lists on demand', async ({ page }) => {
  await page.goto('/planner/today');
  await page.evaluate(async () => {
    const { state, day, replaceWorkspace } = await import('/src/state.ts');
    const workspace = JSON.parse(JSON.stringify(state));
    workspace.spaces.push({ ...workspace.spaces[0], id: 'child', parentId: 'research', title: '实验分支' });
    const sample = workspace.tasks[0];
    workspace.tasks = Array.from({ length: 13 }, (_, i) => ({
      ...sample, id: 'q' + i, spaceId: 'child', title: 'LAB ' + i, date: i === 0 ? '2000-01-01' : day(),
    }));
    workspace.tasks.push({ ...sample, title: 'LAB 无日期', id: 'undated', date: '' },
      { ...sample, title: 'LAB 稍后', id: 'later', date: '2099-01-01' },
      { ...sample, title: 'LAB 其他方向', id: 'other', spaceId: 'paper' },
      { ...sample, title: 'LAB 已完成', id: 'finished', date: '2099-01-01', done: true, status: 'done' });
    workspace.schedule = [];
    replaceWorkspace(workspace);
  });
  const today = page.getByRole('region', { name: '今日行动' });
  const done = page.getByRole('region', { name: '已完成行动' });
  await expect(today.getByRole('checkbox')).toHaveCount(10);
  await page.getByLabel('搜索行动').fill('  lab  ');
  await page.getByLabel('筛选方向').click();
  await page.getByRole('option', { name: /研究生阶段 · 研究能力 大方向/ }).click();
  await expect(page.getByText('找到 16 个行动')).toBeVisible();
  await today.getByRole('button', { name: '显示更多今日行动' }).click();
  await expect(today.getByRole('checkbox')).toHaveCount(13);
  await expect(today).toContainText('待接续');
  await expect(done.getByRole('checkbox')).toHaveCount(1);
  const future = page.getByRole('region', { name: '稍后的安排' });
  await future.getByRole('checkbox').click();
  await expect(done.getByRole('checkbox')).toHaveCount(2);
  await expect(future).toHaveCount(0);
  await done.getByLabel('完成：LAB 稍后').click();
  await expect(future.getByRole('checkbox')).toHaveCount(1);
  await page.getByLabel('搜索行动').fill('no match');
  await expect(page.getByText('没有匹配的行动')).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(today.getByRole('heading')).toContainText('14');
  await expect(today.getByRole('checkbox')).toHaveCount(10);
});

test('browser and directory success times survive reload, with a reminder after later edits or failed backup', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle('备份测试', { create: true }) });
  });
  await page.goto('/planner/reviews');
  await page.getByRole('button', { name: '生成执行小结', exact: true }).click();
  await page.goto('/settings');
  const summary = page.locator('.local-summary');
  await expect(summary).not.toContainText('暂无时间记录');
  await expect(summary).toContainText('尚未写入目录');
  await page.getByRole('button', { name: '选择目录', exact: true }).click();
  await page.getByRole('button', { name: '将浏览器内容写入目录' }).click();
  await expect(summary).toContainText('上次成功写入“备份测试”', { timeout: 20000 });
  await page.reload();
  await expect(summary).not.toContainText('保留一份备份');
  const previous = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.preferences')!).directoryWrite);
  await page.goto('/planner/reviews');
  await page.getByRole('button', { name: '生成执行小结', exact: true }).click();
  await page.goto('/settings');
  await expect(summary).toContainText('保留一份备份');
  await page.evaluate(() => { FileSystemHandle.prototype.requestPermission = async () => 'denied'; });
  await page.getByRole('button', { name: '将浏览器内容写入目录' }).click();
  await expect(page.getByText('需要目录读写授权才能打开工作区。')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.preferences')!).directoryWrite)).toEqual(previous);
});