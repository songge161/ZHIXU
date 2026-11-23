import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.goto('/planner');
  await page.evaluate(async () => {
    const { state, replaceWorkspace, validateWorkspace } = await import('/src/state.ts');
    const workspace = JSON.parse(JSON.stringify(state));
    workspace.spaces = [{ ...workspace.spaces[0], kind: 'branch', difficulty: 1 }, { ...workspace.spaces[1], kind: 'branch', difficulty: 1 }];
    const task = workspace.tasks[0];
    workspace.tasks = [{ ...task, id: 'finished', title: '已完成基础练习', done: true, status: 'done', weight: 1, difficulty: 1, materialIds: [] }, { ...task, id: 'pending', title: '继续综合练习', done: false, status: 'todo', weight: 1, difficulty: 1, materialIds: [] }];
    workspace.materials = []; workspace.reviews = []; workspace.drafts = []; workspace.actionLogs = []; workspace.schedule = [];
    replaceWorkspace(validateWorkspace(workspace));
  });
}
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('edu.prototype.v1.workspace'));

test('manual weight preview preserves facts and matches saving; cancel does not write', async ({ page }) => {
  await seed(page);
  await page.goto('/planner/spaces/research');
  const before = await stored(page);
  await page.getByRole('button', { name: '调整行动：已完成基础练习' }).click();
  await page.getByLabel('行动分量（1-100）').fill('3');
  const preview = page.getByRole('region', { name: '调整影响预览' });
  const node = preview.locator('.preview-change').filter({ hasText: '研究生阶段 · 研究能力' });
  await expect(node).toContainText('进度 50%');
  await expect(node).toContainText('进度 75%');
  await expect(preview).toContainText('已完成行动 1 → 1');
  expect(await stored(page)).toBe(before);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(await stored(page)).toBe(before);
  await page.getByRole('button', { name: '调整行动：已完成基础练习' }).click();
  await page.getByLabel('行动分量（1-100）').fill('3');
  await page.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(page.locator('.space-detail-summary')).toContainText('75%');
  await page.reload();
  await expect(page.locator('.space-detail-summary')).toContainText('75%');
  const value = JSON.parse((await stored(page))!);
  expect(value.tasks.map((row: { done: boolean }) => row.done)).toEqual([true, false]);
});

test('moving an action previews both directions; adding a branch previews the denominator', async ({ page }) => {
  await seed(page);
  await page.goto('/planner/spaces/research');
  const before = await stored(page);
  await page.getByRole('button', { name: '调整行动：继续综合练习' }).click();
  await page.getByLabel('所属方向', { exact: true }).click();
  await page.getByRole('option', { name: /我的第一篇研究论文/ }).click();
  const preview = page.getByRole('region', { name: '调整影响预览' });
  await expect(preview).toContainText('进度 100%');
  await expect(preview).toContainText('我的第一篇研究论文');
  await expect(preview).toContainText('归属：研究生阶段 · 研究能力 → 我的第一篇研究论文');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '新建子方向', exact: true }).click();
  await page.getByLabel('方向名称').fill('后续阶段');
  await page.getByRole('dialog').locator('.planning-settings > summary').click();
  await expect(preview).toContainText('进度 30%');
  await page.getByLabel('在上级中的分量（1-100）').fill('0');
  await expect(preview.getByRole('status')).toContainText('暂不能预览');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(await stored(page)).toBe(before);
});

test('selected AI operations share the actual calculation, including newly referenced records', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'test', name: '模拟接口', protocol: 'responses', baseUrl: 'https://example.test/v1', model: 'test', apiKey: '', enabled: true }]));
    localStorage.setItem('edu.prototype.v1.ai.active', 'test');
  });
  await page.route('**/api/edu/ai/proposal', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { summary: '重新校准分量', operations: [
    { id: 'weight', action: 'update', entity: 'task', targetId: 'finished', reason: '基础阶段分量调整', fields: { weight: 3 } },
    { id: 'new', action: 'create', entity: 'task', targetId: 'new-practice', reason: '补充后续练习', fields: { title: '新的综合练习', spaceId: 'research' } },
  ] } }) }));
  await page.goto('/planner/ai?scope=research');
  const before = await stored(page);
  await page.getByLabel('你希望怎样调整？').fill('校准基础分量并加入后续练习');
  await page.getByRole('button', { name: '生成调整提案' }).click();
  const preview = page.getByRole('region', { name: '调整影响预览' });
  await expect(preview).toContainText('进度 60%');
  await expect(preview).toContainText('行动总数 2 → 3');
  expect(await stored(page)).toBe(before);
  const create = page.locator('.proposal-row').filter({ hasText: '新的综合练习' }).getByRole('checkbox');
  await create.uncheck();
  await expect(preview).toContainText('进度 75%');
  await expect(preview).toContainText('行动总数 2 → 2');
  await create.check();
  await page.getByRole('button', { name: '采纳所选 2 项' }).click();
  await page.goto('/planner/spaces/research');
  await expect(page.locator('.space-detail-summary')).toContainText('60%');
  const value = JSON.parse((await stored(page))!);
  expect(value.tasks.filter((row: { done: boolean }) => row.done)).toHaveLength(1);
  expect(value.tasks).toHaveLength(3);
  await page.goto('/settings');
  const batch = page.locator('details').filter({ hasText: '采纳 AI 提案' });
  await batch.locator('summary').click();
  await expect(batch).toContainText('2 条记录');
  await page.getByRole('button', { name: '撤销最近一次调整' }).click();
  const restored = JSON.parse((await stored(page))!);
  expect(restored.tasks).toEqual(JSON.parse(before!).tasks);
});

test('progress retains the 60/40 split, curves and relative shares', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    const { calculateProgress, relativeShare } = await import('/src/progress.ts');
    const workspace = JSON.parse(JSON.stringify(state));
    workspace.spaces.push({ ...workspace.spaces[0], id: 'child', parentId: 'research', weight: 3 });
    workspace.tasks.push({ ...workspace.tasks[0], id: 'child-task', spaceId: 'child' });
    const progress = calculateProgress(workspace).get('research')!;
    workspace.spaces[0].kind = 'direction'; workspace.spaces[0].difficulty = 4;
    const curved = calculateProgress(workspace).get('research')!.percent;
    return { progress, curved, share: relativeShare(workspace, workspace.spaces[2]) };
  });
  expect(result.progress.raw).toBeCloseTo(0.7);
  expect(result.progress.percent).toBe(70);
  expect(result.progress).toMatchObject({ done: 2, total: 3, directPercent: 50, childPercent: 100 });
  expect(result.curved).toBe(Math.round(Math.pow(0.7, 1.31) * 100));
  expect(result.share).toBe(100);
});

test('moving a scheduled action preserves its schedule through preview, saving and refresh', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    state.schedule.push({ id: 'linked', title: '继续练习', date: '2026-11-05', start: '09:00', end: '10:00', type: 'schedule', category: 'study', spaceId: 'research', taskId: 'pending', note: '', allDay: false });
  });
  await page.goto('/planner/spaces/research');
  await page.getByRole('button', { name: '调整行动：继续综合练习' }).click();
  await page.getByLabel('所属方向', { exact: true }).click();
  await page.getByRole('option', { name: /我的第一篇研究论文/ }).click();
  await expect(page.getByRole('region', { name: '调整影响预览' }).getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: '保存调整', exact: true }).click();
  await page.reload();
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    const { proposalWorkspace, previewIdFactory } = await import('/src/proposalApply.ts');
    const { validateProposal } = await import('/src/ai.ts');
    const rows = validateProposal({ summary: '', operations: [{ id: 'move', action: 'update', entity: 'task', targetId: 'pending', fields: { spaceId: 'research' } }] }).operations;
    const original = JSON.stringify(state);
    const preview = proposalWorkspace(state, rows, '', previewIdFactory(state));
    const actual = proposalWorkspace(state, rows, '');
    const deletion = validateProposal({ summary: '', operations: [{ id: 'delete', action: 'delete', entity: 'task', targetId: 'pending', fields: {} }] }).operations;
    return { source: state.schedule[0], preview: preview.schedule[0], actual: actual.schedule[0], unchanged: original === JSON.stringify(state), deleted: proposalWorkspace(state, deletion, '').schedule };
  });
  expect(result.source).toMatchObject({ id: 'linked', spaceId: 'paper', taskId: 'pending' });
  expect(result.preview).toEqual(result.actual);
  expect(result.preview.spaceId).toBe('research');
  expect(result.unchanged).toBe(true);
  expect(result.deleted).toHaveLength(0);
});