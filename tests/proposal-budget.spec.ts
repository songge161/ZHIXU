import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

for (const protocol of ['responses', 'chat_completions']) {
  test(protocol + ' forwards the exact previewed byte count, valid JSON and output limit', async ({ page }) => {
    const received: Buffer[] = [];
    const stub = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received.push(Buffer.concat(chunks));
      const proposal = '{"summary":"本地模拟提案","operations":[]}';
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(protocol === 'responses' ? { output_text: proposal } : { choices: [{ message: { content: proposal } }] }));
    });
    await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = 'http://127.0.0.1:' + (stub.address() as AddressInfo).port;
      await page.goto('/planner');
      await page.evaluate(({ protocol, baseUrl }) => {
        localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'mock', name: '本地模拟', protocol, baseUrl, model: 'test', enabled: true, apiKey: '' }]));
        localStorage.setItem('edu.prototype.v1.ai.active', 'mock');
      }, { protocol, baseUrl });
      await page.goto('/planner/ai?scope=research');
      const question = '帮我比较“阅读”和 "writing"。🌿\\n';
      await page.getByLabel('你希望怎样调整？').fill(question);
      const preview = page.getByRole('region', { name: '本轮输入预算' });
      const budget = await preview.locator('strong').first().innerText();
      const expectedBytes = Number(budget.match(/输入 ([\d,]+)/)![1].replaceAll(',', ''));
      await preview.getByText('查看阶段摘要与取材明细').click();
      await expect(preview).toContainText('阶段摘要（根据当前记录生成）');
      await page.getByRole('button', { name: '生成调整提案' }).click();
      await expect(page.getByText('本地模拟提案', { exact: true })).toBeVisible();
      expect(received).toHaveLength(1);
      expect(received[0].byteLength).toBe(expectedBytes);
      const payload = JSON.parse(received[0].toString());
      expect(payload.max_output_tokens ?? payload.max_tokens).toBe(4096);
      const message = payload.input ?? payload.messages[1].content;
      expect(message).toContain(question);
      const workspace = JSON.parse(message.split('带稳定 ID 的当前记录：\n')[1]);
      expect(workspace.spaces.map((s: {id: string}) => s.id)).toEqual(['research']);
      expect(workspace.schedule.some((s: {spaceId: string}) => s.spaceId === 'paper')).toBe(false);
      const rejected = await page.request.post('/api/edu/ai/proposal', { data: {
        connection: { protocol, baseUrl, model: 'test' }, request: '测试', context: '长'.repeat(60000), workspace: {}, mode: 'standard',
      } });
      expect(rejected.status()).toBe(413);
      expect(received).toHaveLength(1);
    } finally { stub.closeAllConnections(); await new Promise<void>(resolve => stub.close(() => resolve())); }
  });
}

test('long scoped history is summarized from live records and budgeted without altering originals', async ({ page }) => {
  await page.goto('/planner/ai?scope=research');
  await page.evaluate(async () => {
    const { state, replaceWorkspace, validateWorkspace } = await import('/src/state.ts');
    const workspace = validateWorkspace(state);
    const task = workspace.tasks[0];
    task.summary = '中文🌱'.repeat(2000);
    workspace.actionLogs = Array.from({ length: 35 }, (_, i) => ({
      id: 'log' + i, taskId: task.id, date: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      note: '历史笔记'.repeat(900), result: '观察' + i, blocker: '', next: '',
    }));
    workspace.materials = Array.from({ length: 10 }, (_, i) => ({
      ...workspace.materials[0], spaceId: 'research', id: 'note' + i, name: '资料' + i, excerpt: '文档'.repeat(3000) + '原文结尾',
    }));
    replaceWorkspace(workspace);
  });
  const preview = page.getByRole('region', { name: '本轮输入预算' });
  await preview.getByText('查看阶段摘要与取材明细').click();
  await expect(preview).toContainText('35 条推进记录');
  await expect(preview).toContainText('较早记录 · 2026-01');
  await expect(preview).toContainText('观察34');
  await expect(preview).toContainText('资料 3 / 10');
  await preview.getByLabel('核对原文').selectOption('note0');
  await expect(preview.locator('pre').first()).toContainText('原文结尾');
  await expect(preview.locator('pre').last()).not.toContainText('原文结尾');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    state.actionLogs.pop();
  });
  await expect(preview).toContainText('34 条推进记录');
  await expect(preview).not.toContainText('观察34');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    for (let i = 0; i < 95; i++) state.tasks.push({ ...state.tasks[0], id: 'extra' + i, target: '要求'.repeat(200), summary: '' });
  });
  await expect(preview.getByRole('alert')).toContainText('必要记录已超过');
  await expect(page.getByRole('button', { name: '生成调整提案' })).toBeDisabled();
});

test('all quality settings bound escaped multilingual content and preserve the complete question and criteria', async ({ page }) => {
  await page.goto('/planner/ai');
  const measured = await page.evaluate(async () => {
    const { aiSourceWorkspace, buildAiWorkspace } = await import('/src/state.ts');
    const { prepareProposal } = await import('/src/proposalBudget.ts');
    const source = JSON.parse(JSON.stringify(aiSourceWorkspace()));
    const criteria = '成果标准🌿'.repeat(25);
    source.spaces[0].definitionOfDone = criteria;
    const request = '问题：\\换行\n"引用"🌿'.repeat(90);
    source.tasks = Array.from({ length: 40 }, (_, i) => ({ ...source.tasks[0], id: 'task' + i, summary: request.repeat(5) }));
    return (['standard', 'high', 'highest'] as const).map(mode => {
      const plan = prepareProposal(source, buildAiWorkspace(mode, '', false, source), '整个工作区', request, mode, 'responses', 'test');
      return { used: plan.bytes, limit: plan.limit, blocked: plan.blocked, intact: plan.request === request && plan.workspace.spaces[0].definitionOfDone === criteria, kept: plan.workspace.tasks.filter(t => t.summary).length };
    });
  });
  expect(measured.map(row => row.limit)).toEqual([48, 96, 160].map(k => k * 1024));
  for (const row of measured) {
    expect(row.blocked).toBe(false);
    expect(row.used).toBeLessThanOrEqual(row.limit);
    expect(row.intact).toBe(true);
    expect(row.kept).toBeGreaterThan(0);
    expect(row.kept).toBeLessThan(40);
  }
});
test('planning reuses one imported guide for targeted evidence and for a guide-only request', async ({ page }) => {
  const calls: string[] = [];
  const sentMaterials: { name: string; excerpt: string }[][] = [];
  const stub = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString()).input as string;
    const planning = input.includes('带稳定 ID 的当前记录：\n');
    calls.push(planning ? 'plan' : 'guide');
    if (planning) sentMaterials.push(JSON.parse(input.split('带稳定 ID 的当前记录：\n')[1]).materials);
    const result = planning ? { summary: '模拟规划 ' + sentMaterials.length, operations: [] } :
      { summary: '课题组采购上限与审批安排。', pointers: [{ part: 1, topic: '采购凭据' }, { part: 2, topic: '采购凭据' }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ output_text: JSON.stringify(result) }));
  });
  await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto('/planner');
    await page.evaluate(baseUrl => {
      localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'mock', name: '本地模拟', protocol: 'responses', baseUrl, model: 'test', enabled: true, apiKey: '' }]));
      localStorage.setItem('edu.prototype.v1.ai.active', 'mock');
    }, 'http://127.0.0.1:' + (stub.address() as AddressInfo).port);
    await page.goto('/planner/materials?library=research');
    const source = '# 预付\n' + '甲'.repeat(650) + '发票须附合同。\n# 尾款\n' + '乙'.repeat(650) + '发票须附收货单。\n# 附录\n无关的背景记录。';
    await page.getByLabel('选择学习资料').setInputFiles({ name: '内部手册.md', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await expect(page.getByText(/AI 导读.*课题组采购上限/)).toBeVisible();
    await page.goto('/planner/ai?scope=research');
    await page.locator('.ai-material-source summary').click();
    for (const [i, question] of ['凭据和发票', '上限'].entries()) {
      await page.getByLabel('你希望怎样调整？').fill(question);
      const preview = await page.locator('.planning-source-excerpt').allTextContents();
      await page.getByRole('button', { name: '生成调整提案' }).click();
      await expect(page.getByText('模拟规划 ' + (i + 1), { exact: true })).toBeVisible();
      expect(sentMaterials[i].map(m => m.excerpt)).toEqual(preview);
      expect(sentMaterials[i].map(m => m.name)).toEqual(['内部手册.md']);
    }
    expect(calls).toEqual(['guide', 'plan', 'plan']);
    const excerpt = sentMaterials[0][0].excerpt;
    for (const text of ['原文片段 1', '发票须附合同', '原文片段 2', '发票须附收货单']) expect(excerpt).toContain(text);
    expect(excerpt.length).toBeLessThanOrEqual(500);
    expect(excerpt).not.toContain('无关的背景记录');
    expect(sentMaterials[1][0].excerpt).toBe('AI 导读 · 课题组采购上限与审批安排。');
  } finally { stub.closeAllConnections(); await new Promise<void>(resolve => stub.close(() => resolve())); }
});
