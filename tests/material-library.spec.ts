import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('write Markdown, choose library, download full text, move and filter', async ({ page }) => {
  await page.goto('/planner/materials?library=research');
  await page.getByRole('button', { name: '写 Markdown' }).click();
  await expect(page.getByLabel('所属资料库')).toHaveAttribute('data-value', 'research');
  await page.getByLabel('记录标题').fill('研究方法笔记');
  const body = '# 阅读笔记\n\n' + '具体观察。'.repeat(3000) + '\n\n结尾保留';
  await page.getByLabel('内容', { exact: true }).fill(body);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存记录' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('研究方法笔记.md');
  const saved = await readFile((await file.path())!, 'utf8');
  expect(saved).toContain('spaceId: "research"');
  expect(saved).toContain(body);
  await page.reload();
  await expect(page.getByRole('heading', { name: '研究方法笔记' })).toBeVisible();
  await page.getByRole('button', { name: '调整资料：研究方法笔记' }).click();
  await expect(page.getByLabel('内容', { exact: true })).toHaveValue(body);
  await page.getByLabel('所属资料库').click();
  await page.getByRole('option', { name: /总文件库/ }).click();
  await page.getByLabel('同时下载 .md 文件').uncheck();
  await page.getByRole('button', { name: '保存记录' }).click();
  await page.goto('/planner/materials?library=research');
  await expect(page.getByRole('heading', { name: '研究方法笔记' })).toHaveCount(0);
  await page.getByLabel('查看资料库').click();
  await page.getByRole('option', { name: /总文件库/ }).click();
  await expect(page.getByRole('heading', { name: '研究方法笔记' })).toBeVisible();
});

test('AI reads scoped and inherited materials, global is optional, other roots stay out', async ({ page }) => {
  await page.goto('/planner');
  const result = await page.evaluate(async () => {
    const { state, buildAiWorkspace, buildContext } = await import('/src/state.ts');
    state.spaces.push({ ...state.spaces[0], id: 'child', parentId: 'research', title: '子方向' });
    state.materials.splice(0);
    for (const [id, spaceId] of [['child-m', 'child'], ['parent-m', 'research'], ['global-m', ''], ['other-m', 'paper']]) {
      state.materials.push({ id, spaceId, name: id, kind: '阅读笔记', size: 0, date: '2026-10-14', excerpt: '# 完整笔记\n' + '正文'.repeat(9000), demo: false });
    }
    const local = buildAiWorkspace('standard', 'child');
    const global = buildAiWorkspace('standard', 'child', true);
    const context = buildContext('standard', 'child', true);
    return { local: local.materials.map(m => m.id), global: global.materials.map(m => m.id), lengths: global.materials.map(m => m.excerpt.length), context, fullLength: state.materials[0].excerpt.length };
  });
  expect(result.local).toEqual(['child-m', 'parent-m']);
  expect(result.global).toEqual(['child-m', 'parent-m', 'global-m']);
  expect(result.lengths.every(n => n <= 500)).toBe(true);
  expect(result.fullLength).toBeGreaterThan(12000);
  expect(result.context).toContain('总文件库');
  expect(result.context).not.toContain('other-m');
  await page.goto('/planner/ai?scope=child');
  await page.getByText('本轮将参考 2 份资料').click();
  await expect(page.locator('.ai-material-source')).toContainText('parent-m');
  await page.getByLabel('同时参考总文件库').check();
  await expect(page.locator('.ai-material-source')).toContainText('global-m');
});

test('saving a note writes Markdown into the chosen directory and protects local edits', async ({ page }) => {
  await page.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory() as never; });
  await page.goto('/settings');
  await page.getByRole('button', { name: '选择目录', exact: true }).click();
  await expect(page.getByRole('button', { name: '更换目录' })).toBeVisible();
  await page.goto('/planner/materials?library=research');
  await page.getByRole('button', { name: '写 Markdown' }).click();
  await page.getByLabel('记录标题').fill('同步笔记');
  await page.getByLabel('内容', { exact: true }).fill('# 笔记\n完整正文');
  await page.getByRole('button', { name: '保存记录' }).click();
  await expect(page.locator('.library-local')).toContainText('已写入');
  const original = await page.evaluate(async () => {
    const { state } = await import('/src/state.ts');
    const id = state.materials.find(m => m.name === '同步笔记')!.id;
    const root = await navigator.storage.getDirectory();
    const handle = await (await root.getDirectoryHandle('evidence')).getFileHandle(`${id}.md`);
    const content = await (await handle.getFile()).text();
    const writer = await handle.createWritable();
    await writer.write(content.replace('完整正文', '本地另写的内容')); await writer.close();
    return { id, content };
  });
  expect(original.content).toContain('spaceId: "research"');
  await page.getByRole('button', { name: '调整资料：同步笔记' }).click();
  await page.getByLabel('内容', { exact: true }).fill('浏览器的新内容');
  await page.getByRole('button', { name: '保存记录' }).click();
  await expect(page.locator('.library-local')).toContainText('存在本地修改');
  const disk = await page.evaluate(async id => {
    const root = await navigator.storage.getDirectory();
    return (await (await (await root.getDirectoryHandle('evidence')).getFileHandle(`${id}.md`)).getFile()).text();
  }, original.id);
  expect(disk).toContain('本地另写的内容'); expect(disk).not.toContain('浏览器的新内容');
});
test('mobile library shows a saved title on first screen, keeps offline lookup and prioritizes import in an empty scope', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/planner/materials');
  const first = page.locator('.material-card').first();
  await expect(first.getByRole('heading')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: '导入资料', exact: true })).toHaveAttribute('aria-expanded', 'false');
  const button = first.getByRole('button', { name: /^调整资料/ });
  const bounds = await button.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  const contrast = await first.locator('.tiny-badge').evaluate(el => {
    function luminance(rgb: string) {
      const channels = rgb.match(/\d+/g)!.slice(0, 3).map(Number).map(n => n / 255)
        .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    }
    const style = getComputedStyle(el);
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button', { name: '问资料', exact: true }).click();
  await page.getByLabel('资料问题').fill('研究问题');
  await page.getByText(/本次引用/).click();
  await expect(page.locator('.material-questions pre').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '根据资料回答' })).toBeDisabled();
  await page.getByRole('button', { name: '问资料', exact: true }).click();
  await page.getByLabel('搜索资料').fill('无匹配的文件名');
  await expect(page.getByRole('button', { name: '选择文件' })).toBeHidden();
  await page.goto('/planner/materials?library=research');
  await expect(page.getByRole('button', { name: '选择文件' })).toBeVisible();
});

test('import from an action links files in its own library and reuses an identical original', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.getByText('关联学习资料', { exact: true }).click();
  const row = page.getByRole('group', { name: '精读一篇文献，记录核心问题与方法' });
  const file = { name: '实验记录.md', mimeType: 'text/markdown', buffer: Buffer.from('实验变量需要控制温度。') };
  for (let i = 0; i < 2; i++) {
    const pending = page.waitForEvent('filechooser');
    await row.getByRole('button', { name: '导入并关联' }).click();
    await (await pending).setFiles(file);
    await expect(row.getByRole('checkbox', { name: /实验记录.md/ })).toBeChecked();
    await expect(row.getByRole('button', { name: '导入并关联' })).toBeEnabled();
  }
  await page.reload();
  await page.getByText('关联学习资料', { exact: true }).click();
  await expect(row.getByRole('checkbox', { name: /实验记录.md/ })).toBeChecked();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!));
  const docs = data.materials.filter((m: {name: string}) => m.name === '实验记录.md');
  expect(docs).toHaveLength(1);
  expect(docs[0]).toMatchObject({ spaceId: 'research', excerpt: '实验变量需要控制温度。' });
  expect(data.tasks.find((t: {id: string}) => t.id === 't1')).toMatchObject({materialIds: [docs[0].id], evidenceLevel: 'recorded'});
  expect(data.tasks.filter((t: {id: string; materialIds: string[]}) => t.id !== 't1' && t.materialIds.includes(docs[0].id))).toHaveLength(0);
});

test('side-by-side library and action controls share top and bottom edges and fit narrow panels', async ({ page }) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/planner/materials?library=research');
    const picker = (await page.getByLabel('查看资料库').boundingBox())!;
    const search = (await page.getByLabel('搜索资料').boundingBox())!;
    if (width > 390) {
      expect(Math.abs(picker.y - search.y)).toBeLessThan(1);
      expect(picker.height).toBe(search.height);
    } else expect(search.y).toBeGreaterThan(picker.y + picker.height);
    await page.goto('/planner/spaces/research');
    await page.getByText('行动状态与完成条件', { exact: true }).click();
    const mode = (await page.locator('.task-mode-row select').first().boundingBox())!;
    const target = (await page.locator('.task-mode-row input').first().boundingBox())!;
    if (width > 390) expect(Math.abs(mode.y - target.y)).toBeLessThan(1);
    else expect(target.y).toBeGreaterThan(mode.y + mode.height);
    expect(mode.height).toBe(target.height);
    expect(target.x + target.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
