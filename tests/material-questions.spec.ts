import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { zipSync, strToU8 } from 'fflate';

for (const protocol of ['responses', 'chat_completions']) {
  test(protocol + ' imports once and answers two questions from different source sections', async ({ page }) => {
    const received: { question?: string; passages: { part: number; text: string }[] }[] = [];
    const stub = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      const message = JSON.parse(payload.input ?? payload.messages[1].content);
      received.push(message);
      const result = message.question
        ? '根据原文，' + message.passages[0].text + ' [1]'
        : JSON.stringify({ summary: '记录开题安排与经费。', pointers: [{ part: 1, topic: '什么时候交材料' }, { part: 3, topic: '经费额度' }] });
      res.end(JSON.stringify(protocol === 'responses' ? { output_text: result } : { choices: [{ message: { content: result } }] }));
    });
    await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
    try {
      await page.goto('/planner/materials?library=research');
      await page.evaluate(({ protocol, baseUrl }) => {
        localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'mock', name: '本地模型', protocol, baseUrl, model: 'test', enabled: true, apiKey: '' }]));
        localStorage.setItem('edu.prototype.v1.ai.active', 'mock');
      }, { protocol, baseUrl: 'http://127.0.0.1:' + (stub.address() as AddressInfo).port });
      await page.reload();
      const source = '# 开题\n截止日期为六月一日。\n# 附录\n无需发送的无关段落。\n# 费用\n预算五万元。';
      const upload = { name: '手册.md', mimeType: 'text/plain', buffer: Buffer.from(source) };
      await page.getByLabel('选择学习资料').setInputFiles(upload);
      await expect(page.getByText(/AI 导读.*记录开题安排与经费/)).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: '问资料', exact: true }).click();
      for (const [question, match, other] of [['什么时候交材料', '六月一日', '五万元'], ['经费额度', '五万元', '六月一日']]) {
        await page.getByLabel('资料问题').fill(question);
        await page.getByRole('button', { name: '根据资料回答' }).click();
        await expect(page.locator('.library-answer')).toContainText(match);
        expect(received.at(-1)?.passages).toHaveLength(1);
        expect(JSON.stringify(received.at(-1))).not.toContain(other);
        expect(JSON.stringify(received.at(-1))).not.toContain('无关段落');
      }
      await page.getByLabel('选择学习资料').setInputFiles({ ...upload, name: '手册副本.md' });
      await expect(page.getByText(/AI 导读.*记录开题安排与经费/)).toHaveCount(2);
      expect(received.map(r => r.question ?? 'guide')).toEqual(['guide', '什么时候交材料', '经费额度']);
      await page.getByLabel('资料问题').fill('zzzzzz');
      await expect(page.getByRole('button', { name: '根据资料回答' })).toBeDisabled();
      await page.getByRole('button', { name: '调整资料：手册.md', exact: true }).click();
      await page.getByLabel('内容', { exact: true }).fill('新的版本');
      await page.getByLabel('同时下载 .md 文件').uncheck();
      await page.getByRole('button', { name: '保存记录' }).click();
      await expect(page.getByText(/AI 导读.*记录开题安排与经费/)).toHaveCount(1);
    } finally { stub.closeAllConnections(); await new Promise<void>(resolve => stub.close(() => resolve())); }
  });
}

test('DOCX and PDF preserve extractable text, original bytes and nested folder ownership', async ({ page }) => {
  await page.goto('/planner/materials');
  const docx = zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>阶段交付物</w:t></w:r></w:p></w:body></w:document>') });
  const data = 'BT /F1 12 Tf 20 60 Td (Research deadline) Tj ET';
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>', '<</Length ' + data.length + '>>\nstream\n' + data + '\nendstream'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n'; });
  const start = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n' + start + '\n%%EOF';
  await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    state.spaces.push({ ...state.spaces[0], id: 'phase', title: '开题阶段', parentId: 'research' });
  });
  await page.goto('/planner/materials?library=phase');
  await page.getByLabel('选择学习资料').setInputFiles([
    { name: '阶段.docx', mimeType: 'application/octet-stream', buffer: Buffer.from(docx) },
    { name: '资料.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) },
  ]);
  await expect(page.getByRole('heading', { name: '阶段.docx' })).toBeVisible();
  await expect(page.locator('.material-card').filter({ hasText: '资料.pdf' })).toContainText('第 1 页');
  await expect(page.locator('.material-card').filter({ hasText: '资料.pdf' })).toContainText('Research deadline');
  await expect(page.getByText('阶段交付物', { exact: true }).first()).toBeVisible();
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    const { writeWorkspaceFolder, readWorkspaceFolder } = await import('/src/directory.ts');
    const root = await navigator.storage.getDirectory();
    const handle = Object.assign(root, { requestPermission: async () => 'granted' });
    await writeWorkspaceFolder(handle, state);
    const originals = await root.getDirectoryHandle('originals');
    const research = await originals.getDirectoryHandle(state.spaces.find(s => s.id === 'research')!.title + '_research');
    const branch = await research.getDirectoryHandle('开题阶段_phase');
    const row = state.materials.find(m => m.name === '资料.pdf')!;
    const file = await (await branch.getFileHandle('资料-' + row.sourceHash + '.pdf')).getFile();
    const restored = (await readWorkspaceFolder(handle)).workspace.materials.find(m => m.id === row.id)!;
    return { pdf: await file.text(), owner: restored.spaceId, hash: restored.sourceHash };
  });
  expect(result.pdf).toBe(pdf);
  expect(result.owner).toBe('phase');
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
});

test('one shared reference is searchable from another library, while unrelated sources stay out', async ({ page }) => {
  await page.goto('/planner/materials?library=research');
  await page.getByLabel('选择学习资料').setInputFiles({ name: '报销说明.txt', mimeType: 'text/plain', buffer: Buffer.from('经费报销需要附发票。') });
  await page.getByRole('button', { name: '调整资料：报销说明.txt' }).click();
  await page.getByText('在其他方向引用这份资料').click();
  const reference = page.locator('.material-references input[value="paper"]');
  await reference.check();
  await page.getByLabel('同时下载 .md 文件').uncheck();
  await page.getByRole('button', { name: '保存记录' }).click();
  await page.goto('/planner/materials?library=paper');
  await page.getByLabel('选择学习资料').setInputFiles({ name: '本级练习.txt', mimeType: 'text/plain', buffer: Buffer.from('语音练习要求跟读三遍。') });
  await expect(page.getByRole('heading', { name: '本级练习.txt' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '报销说明.txt' })).toBeVisible();
  await page.getByRole('button', { name: '问资料', exact: true }).click();
  await page.getByLabel('资料问题').fill('经费报销');
  await page.getByText(/本次引用 1 段/).click();
  await expect(page.locator('.material-questions pre')).toHaveText('经费报销需要附发票。');
  const count = await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    return state.materials.filter(m => m.name === '报销说明.txt').length;
  });
  expect(count).toBe(1);
  await page.goto('/planner/materials?library=research');
  await page.getByRole('button', { name: '问资料', exact: true }).click();
  await page.getByLabel('资料问题').fill('语音练习');
  await expect(page.getByText(/当前范围没有匹配原文/)).toBeVisible();
});
