import { test, expect } from '@playwright/test';

test('node assessments keep criteria snapshots and require evidence for a met outcome', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    state.spaces[0].definitionOfDone = '独立比较三篇文献的方法';
    state.materials.push({ id: 'comparison', spaceId: 'research', name: '文献比较笔记', kind: '成果', excerpt: '比较结果', size: 0, date: '2026-11-05', demo: false });
  });
  await page.getByText('目标验收与方向状态', { exact: true }).click();
  const panel = page.getByRole('region', { name: '节点验收' });
  await panel.getByRole('button', { name: '记录一次验收' }).click();
  await panel.getByLabel('验收结论').selectOption('met');
  await panel.getByLabel('判断依据').fill('三篇方法已比较，结论有引用。');
  await panel.getByRole('button', { name: '保存验收' }).click();
  await expect(panel.getByRole('alert')).toContainText('至少关联一份');
  await panel.getByLabel('文献比较笔记').check();
  await panel.getByRole('button', { name: '保存验收' }).click();
  await page.reload();
  await page.getByText('目标验收与方向状态', { exact: true }).click();
  await panel.locator('.assessment-record summary').click();
  await expect(panel.locator('pre')).toContainText('独立比较三篇文献的方法');
  await expect(panel.locator('pre')).toContainText('文献比较笔记');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/edu-assessment-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  const data = await page.evaluate(async () => {
    const { state, buildContext, buildAiWorkspace } = await import('/src/state.ts');
    const context = buildContext('standard', 'research');
    const other = buildAiWorkspace('standard', 'paper');
    const snapshot = state.reviews[0].assessment;
    state.spaces[0].definitionOfDone = '增加第四篇方法比较';
    state.materials = state.materials.filter(row => row.id !== 'comparison');
    return { context, other: other.reviews, snapshot, status: state.spaces[0].status, done: state.tasks.filter(row => row.spaceId === 'research').map(row => row.done) };
  });
  expect(data.context).toContain('验收结论：已达标');
  expect(data.other).toHaveLength(0);
  expect(data.snapshot?.evidence[0].id).toBe('comparison');
  expect(data.status).toBe('active');
  expect(data.done.some(done => !done)).toBe(true);
  await expect(panel.getByText('完成标准已变化', { exact: false })).toBeVisible();
  await expect(panel.getByText('部分关联资料已删除', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: '调整验收' }).click();
  await panel.getByRole('button', { name: '保存验收' }).click();
  await expect(panel.getByRole('alert')).toContainText('部分证据已删除');
  await panel.getByRole('button', { name: '移除失效关联' }).click();
  await panel.getByLabel('验收结论').selectOption('partial');
  await panel.getByRole('button', { name: '保存验收' }).click();
  await panel.getByRole('button', { name: '删除验收' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(panel.locator('.assessment-record')).toHaveCount(0);
});

test('assessment metadata survives Markdown roundtrip and invalid imports are rejected', async ({ page }) => {
  await page.goto('/planner');
  const result = await page.evaluate(async () => {
    const { state, validateWorkspace } = await import('/src/state.ts');
    const { writeWorkspaceFolder, readWorkspaceFolder } = await import('/src/directory.ts');
    const { assessmentBody } = await import('/src/assessment.ts');
    class Folder {
      name = 'test'; files = new Map<string, string>(); dirs = new Map<string, Folder>();
      async requestPermission() { return 'granted'; }
      async getDirectoryHandle(name: string, options?: { create?: boolean }) { if (!this.dirs.has(name)) { if (!options?.create) throw new DOMException('', 'NotFoundError'); this.dirs.set(name, new Folder()); } return this.dirs.get(name)!; }
      async getFileHandle(name: string, options?: { create?: boolean }) { if (!this.files.has(name)) { if (!options?.create) throw new DOMException('', 'NotFoundError'); this.files.set(name, ''); } return { getFile: async () => ({ text: async () => this.files.get(name)! }), createWritable: async () => ({ write: async (text: string) => { this.files.set(name, text); }, close: async () => {}, abort: async () => {} }) }; }
    }
    const workspace = JSON.parse(JSON.stringify(state));
    const assessment = { criteria: '解释方法差异', outcome: 'partial' as const, reason: '还有一篇未读', gaps: '补读', evidence: [{ id: 'deleted-material', name: '历史证据' }] };
    workspace.reviews.push({ id: 'acceptance', spaceId: 'research', title: '验收', date: '2026-11-05', body: assessmentBody(assessment), assessment });
    const folder = new Folder();
    await writeWorkspaceFolder(folder, workspace);
    const restored = validateWorkspace((await readWorkspaceFolder(folder)).workspace);
    const text = folder.dirs.get('reviews')!.files.get('acceptance.md');
    let invalidRejected = false;
    workspace.reviews[0].assessment.outcome = 'met'; workspace.reviews[0].assessment.evidence = [];
    try { validateWorkspace(workspace); } catch { invalidRejected = true; }
    const legacy = JSON.parse(JSON.stringify(restored)); delete legacy.reviews[0].assessment;
    return { assessment: restored.reviews[0].assessment, text, invalidRejected, legacy: validateWorkspace(legacy).reviews[0].assessment };
  });
  expect(result.assessment).toMatchObject({ criteria: '解释方法差异', outcome: 'partial', evidence: [{ id: 'deleted-material', name: '历史证据' }] });
  expect(result.text).toContain('assessment:');
  expect(result.invalidRejected).toBe(true);
  expect(result.legacy).toBeUndefined();
});

test('AI cannot overwrite or delete a user assessment', async ({ page }) => {
  await page.goto('/planner');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    state.reviews.push({ id: 'acceptance', spaceId: 'research', title: '我的验收', date: '2026-11-05', body: '原始验收内容', assessment: { criteria: '独立比较方法', outcome: 'partial', reason: '还有未读内容', gaps: '', evidence: [] } });
    localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'test', name: '模拟接口', protocol: 'responses', baseUrl: 'https://example.test/v1', model: 'test', apiKey: '', enabled: true }]));
    localStorage.setItem('edu.prototype.v1.ai.active', 'test');
  });
  let action = 'update';
  await page.route('**/api/edu/ai/proposal', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { summary: '建议', operations: [{ id: 'change', action, entity: 'review', targetId: 'acceptance', fields: { text: 'AI 重写', spaceId: 'research' } }] } }) }));
  for (const next of ['update', 'delete']) {
    action = next;
    await page.goto('/planner/ai?scope=research');
    await page.getByLabel('你希望怎样调整？').fill('评估进度');
    await page.getByRole('button', { name: '生成调整提案' }).click();
    await page.getByRole('button', { name: /采纳所选/ }).click();
    await expect(page.getByText(/验收记录由你在方向详情中/)).toBeVisible();
    const reviews = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).reviews);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].body).toBe('原始验收内容');
  }
});