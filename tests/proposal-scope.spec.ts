import { test, expect } from '@playwright/test';

test('scope handles nested temporary IDs, missing parents, drafts, moves and cycles', async ({ page }) => {
  await page.goto('/planner');
  const result = await page.evaluate(async () => {
    const { proposalIssues } = await import('/src/proposalScope.ts');
    const { validateProposal } = await import('/src/ai.ts');
    const { state, buildAiWorkspace, validateWorkspace } = await import('/src/state.ts');
    const parse = (operations: unknown[]) => validateProposal({ summary: '', operations }).operations;
    const child = { id: 'a', action: 'create', entity: 'space', targetId: 'new-child', fields: { title: '听力', parentId: 'research' } };
    const nested = { id: 'b', action: 'create', entity: 'space', targetId: 'new-nested', fields: { title: '音素辨认', parentId: 'new-child' } };
    const task = { id: 'c', action: 'create', entity: 'task', targetId: 'new-action', fields: { title: '辨认并记录五组音素', spaceId: 'new-nested' } };
    const draft = { id: 'd', action: 'create', entity: 'draft', targetId: 'new-draft', fields: { text: '待确认每周学习时间' } };
    const issues = (rows: unknown[], scope = 'research') => [...proposalIssues(state, parse(rows), scope).values()];
    const valid = issues([task, nested, child, draft]);
    const missingParent = issues([task, nested]);
    const outside = issues([{ ...child, fields: { title: '听力', parentId: 'paper' } }]);
    const cycle = issues([child, { ...nested, targetId: 'research', action: 'update', fields: { parentId: 'new-child' } }]);
    state.drafts.push({ id: 'scoped-note', spaceId: 'research', text: '研究草稿', date: '', applied: false });
    state.drafts.push({ id: 'foreign-note', spaceId: 'paper', text: '其他方向草稿', date: '', applied: false });
    const editOutside = issues([{ id: 'e', action: 'update', entity: 'draft', targetId: 'foreign-note', fields: { text: '修改' } }]);
    const ownDraft = issues([{ id: 'e', action: 'update', entity: 'draft', targetId: 'scoped-note', fields: { text: '修改' } }]);
    const filtered = buildAiWorkspace('standard', 'research').drafts.map(d => d.id);
    const preserved = validateWorkspace(JSON.parse(JSON.stringify(state))).drafts.find(d => d.id === 'scoped-note')?.spaceId;
    let staleRejected = false; try { buildAiWorkspace('standard', 'missing'); } catch { staleRejected = true; }
    return { valid, missingParent, outside, cycle, editOutside, ownDraft, filtered, preserved, staleRejected };
  });
  expect(result.valid).toEqual([]); expect(result.ownDraft).toEqual([]);
  expect(result.missingParent.length).toBeGreaterThan(0); expect(result.outside.length).toBeGreaterThan(0);
  expect(result.cycle.length).toBeGreaterThan(0); expect(result.editOutside.length).toBeGreaterThan(0);
  expect(result.filtered).toEqual(['scoped-note']); expect(result.preserved).toBe('research'); expect(result.staleRejected).toBe(true);
});

test('scoped AI creates a branch, its action and a draft together; dependencies are explained', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'test', name: '模拟接口', protocol: 'responses', baseUrl: 'https://example.test/v1', model: 'test', apiKey: '', enabled: true }]));
    localStorage.setItem('edu.prototype.v1.ai.active', 'test');
  });
  await page.route('**/api/edu/ai/proposal', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: {
    summary: '先建立一个暂定分支，学习时间待确认。', operations: [
      { id: 'branch', action: 'create', entity: 'space', targetId: 'branch-new', reason: '分开组织能力训练', fields: { title: '听力起步（暂定）', parentId: 'research', description: '暂按每天 20 分钟；确认可用时间后调整。', kind: 'branch', weight: 30, difficulty: 2 } },
      { id: 'task', action: 'create', entity: 'task', targetId: 'task-new', reason: '获得起点证据', fields: { title: '听一段短音频并记录五处听不清的内容', spaceId: 'branch-new', text: '产出：五处疑难及核对记录；不以听完作为掌握。', minutes: 20 } },
      { id: 'draft', action: 'create', entity: 'draft', targetId: 'draft-new', reason: '保留开放问题', fields: { title: '学习时间待确认', text: '每周能稳定投入多久？' } },
    ],
  } }) }));
  await page.goto('/planner/ai?scope=research&intent=refine');
  await page.getByRole('button', { name: '生成调整提案' }).click();
  const branch = page.locator('.proposal-row').filter({ hasText: '听力起步（暂定）' }).first();
  await branch.getByRole('checkbox').uncheck();
  await expect(page.getByText('所属方向不存在或未选中。请同时勾选新建父分支，或取消删除父分支。')).toBeVisible();
  await expect(page.getByRole('button', { name: '采纳所选 2 项' })).toBeDisabled();
  await branch.getByRole('checkbox').check();
  await page.getByText('查看具体内容', { exact: true }).nth(1).click();
  await expect(page.getByText('产出：五处疑难及核对记录；不以听完作为掌握。')).toBeVisible();
  await page.getByRole('button', { name: '采纳所选 3 项' }).click();
  await expect(page.getByRole('heading', { name: 'AI 调整提案' })).toHaveCount(0);
  await page.goto('/planner/spaces/research');
  await page.getByRole('link', { name: /听力起步/ }).click();
  await page.reload();
  await expect(page.locator('.detail-actions-list').getByText('听一段短音频并记录五处听不清的内容', { exact: true })).toBeVisible();
  await page.goto('/planner/today');
  await expect(page.getByText('每周能稳定投入多久？')).toBeVisible();
});