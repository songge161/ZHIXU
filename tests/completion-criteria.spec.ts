import { test, expect } from '@playwright/test';

test('completion criteria survive editing, reload and scoped AI context; legacy data stays usable', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.getByRole('button', { name: '调整方向', exact: true }).click();
  await page.getByLabel('完成标准（可留空）').fill('独立比较三篇文献的方法，并写出带引用的笔记。');
  await page.getByRole('button', { name: '保存调整', exact: true }).click();
  await page.reload();
  await page.getByText('完成标准', { exact: true }).click();
  await expect(page.locator('.detail-summary-side')).toContainText('独立比较三篇文献的方法');
  const result = await page.evaluate(async () => {
    const { state, buildContext, buildAiWorkspace, validateWorkspace } = await import('/src/state.ts');
    const original = JSON.parse(JSON.stringify(state));
    delete original.spaces[0].definitionOfDone;
    return { context: buildContext('standard', 'research'), ai: buildAiWorkspace('standard', 'research').spaces[0].definitionOfDone, legacy: validateWorkspace(original).spaces[0].definitionOfDone };
  });
  expect(result.context).toContain('独立比较三篇文献的方法');
  expect(result.ai).toContain('独立比较三篇文献的方法');
  expect(result.legacy).toBe('');
  await page.getByRole('button', { name: '调整完成标准' }).click();
  await page.getByLabel('完成标准（可留空）').fill('');
  await page.getByRole('button', { name: '保存调整', exact: true }).click();
  await page.reload();
  await expect(page.getByText('完成标准 · 待补充', { exact: true })).toBeVisible();
});

test('AI criteria require acceptance, preserve omitted values and support explicit clearing', async ({ page }) => {
  await page.goto('/planner');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    state.spaces[0].definitionOfDone = '原有标准';
    localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'test', name: '模拟接口', protocol: 'responses', baseUrl: 'https://example.test/v1', model: 'test', apiKey: '', enabled: true }]));
    localStorage.setItem('edu.prototype.v1.ai.active', 'test');
  });
  let fields: Record<string, string | null> = { definitionOfDone: '完成一份有引用的比较笔记' };
  await page.route('**/api/edu/ai/proposal', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { summary: '调整完成标准', operations: [{ id: 'update', action: 'update', entity: 'space', targetId: 'research', reason: '明确成果', fields }] } }) }));
  const criteria = () => page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).spaces[0].definitionOfDone);
  for (const [next, expected] of [[{ definitionOfDone: '完成一份有引用的比较笔记' }, '完成一份有引用的比较笔记'], [{ description: '只更新说明' }, '完成一份有引用的比较笔记'], [{ definitionOfDone: null }, '完成一份有引用的比较笔记'], [{ definitionOfDone: '' }, '']] as const) {
    fields = next;
    await page.goto('/planner/ai?scope=research');
    const before = await criteria();
    await page.getByLabel('你希望怎样调整？').fill('调整目标');
    await page.getByRole('button', { name: '生成调整提案' }).click();
    await expect(page.locator('.proposal-content>strong')).toBeVisible();
    expect(await criteria()).toBe(before);
    await page.getByRole('button', { name: /采纳所选/ }).click();
    expect(await criteria()).toBe(expected);
  }
});