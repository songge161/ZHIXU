import { test, expect } from '@playwright/test';

test('proposal copy resolves record names without changing identifiers or guessing ambiguous prefixes', async ({ page }) => {
  await page.goto('/planner');
  const result = await page.evaluate(async () => {
    const { readableReferences, recordTitle } = await import('/src/proposalText.ts');
    const { state } = await import('/src/state.ts');
    const { validateProposal } = await import('/src/ai.ts');
    const id = '589e20cd-1111-4111-8111-111111111111';
    state.tasks.push({ ...state.tasks[0], id, title: '明确日语学习目标' });
    const rows = validateProposal({ summary: '', operations: [{ id: 'update', action: 'update', entity: 'space', targetId: 'research', fields: { description: `已完成 ${id}，下一步继续学习。` } }] }).operations;
    const title = recordTitle(state, rows[0]);
    const full = readableReferences(rows[0].fields.description, state, rows);
    const short = readableReferences('589e20cd 已完成；x589e20cd 不替换。', state);
    state.tasks.push({ ...state.tasks[0], id: '589e20cd-2222-4222-8222-222222222222', title: '另一项行动' });
    const ambiguous = readableReferences('589e20cd', state);
    return { title, full, short, ambiguous, target: rows[0].targetId, original: rows[0].fields.description };
  });
  expect(result.title).toBe('研究生阶段 · 研究能力');
  expect(result.full).toBe('已完成 「明确日语学习目标」，下一步继续学习。');
  expect(result.short).toContain('「明确日语学习目标」 已完成');
  expect(result.short).toContain('x589e20cd');
  expect(result.ambiguous).toBe('589e20cd');
  expect(result.target).toBe('research');
  expect(result.original).toContain('589e20cd-1111-4111-8111-111111111111');
});

test('unnamed update proposal uses the existing title and shows readable body', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'test', name: '模拟接口', protocol: 'responses', baseUrl: 'https://example.test/v1', model: 'test', apiKey: '', enabled: true }]));
    localStorage.setItem('edu.prototype.v1.ai.active', 'test');
  });
  await page.route('**/api/edu/ai/proposal', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { summary: '下一步先整理三个研究问题。', operations: [{ id: 'update', action: 'update', entity: 'space', targetId: 'research', reason: '让下一步更明确。', fields: { description: '围绕三个问题阅读文献。' } }] } }) }));
  await page.goto('/planner/ai?scope=research');
  await page.getByLabel('你希望怎样调整？').fill('整理下一步');
  await page.getByRole('button', { name: '生成调整提案' }).click();
  await expect(page.locator('.proposal-content>strong')).toHaveText('研究生阶段 · 研究能力');
  await page.getByText('查看具体内容', { exact: true }).click();
  await expect(page.locator('.proposal-body')).toContainText('围绕三个问题阅读文献。');
});