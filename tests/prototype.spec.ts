import { test, expect } from '@playwright/test';

test('education homepage stays separate; routes load without errors or external calls', async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4180') && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('自己的体系');
  await expect(page).toHaveURL('http://127.0.0.1:4180/');
  await page.screenshot({ path: 'output/portal-desktop.png', fullPage: true });
  await page.locator('.portal-intro').getByRole('link', { name: '打开我的学习规划' }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('我的大方向');
  await expect(page.getByLabel('想法草稿')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.screenshot({ path: 'output/planner-desktop.png', fullPage: true });
  for (const path of ['/planner/today', '/planner/materials', '/planner/reviews', '/planner/ai', '/planner/sync', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.screenshot({ path: 'output/settings-desktop.png', fullPage: true });
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('task completion, new direction and draft-to-action survive reload', async ({ page }) => {
  await page.goto('/planner/today');
  const firstTask = page.getByRole('checkbox', { name: '完成：精读一篇文献，记录核心问题与方法' });
  await firstTask.click();
  await page.reload();
  await page.getByRole('button', { name: '查看已完成' }).click();
  await expect(firstTask).toBeChecked();
  await page.goto('/planner');
  await page.getByRole('button', { name: '新建大方向', exact: true }).click();
  await page.getByLabel('方向名称').fill('数学基础');
  await page.getByLabel('为什么想做这件事').fill('为研究补充线性代数基础');
  await page.getByRole('button', { name: '创建大方向' }).click();
  await expect(page.getByRole('heading', { name: '数学基础' })).toBeVisible();
  await page.goto('/planner/today');
  await page.getByLabel('想法草稿').fill('整理特征值与特征向量的关系');
  await page.getByRole('button', { name: '记下想法' }).click();
  await page.getByRole('button', { name: '转为行动', exact: true }).click();
  await page.getByLabel('所属方向').click();
  await page.getByRole('option', { name: /数学基础/ }).click();
  await page.getByLabel('计划日期').fill(await page.evaluate(() => new Date().toLocaleDateString('sv-SE')));
  await page.getByLabel('预计投入（分钟，可留空）').fill('25');
  await page.getByRole('button', { name: '加入计划' }).click();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '完成：整理特征值与特征向量的关系' })).toBeVisible();
  await expect(page.getByText('已转为行动', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '调整行动：整理特征值与特征向量的关系' }).click();
  await page.getByLabel('行动内容').fill('整理特征值笔记并做两道例题');
  await page.getByLabel('计划日期').fill('2099-01-01');
  await page.getByLabel('预计投入（分钟，可留空）').fill('40');
  await page.getByRole('button', { name: '保存调整' }).click();
  await page.goto('/planner/today');
  await expect(page.getByRole('region', { name: '稍后的安排' })).toContainText('整理特征值笔记并做两道例题');
  await expect(page.getByRole('region', { name: '稍后的安排' })).toContainText('40分钟');
});

test('new actions are unscheduled until the user chooses a date or time estimate', async ({ page }) => {
  await page.goto('/planner/today');
  await page.getByRole('button', { name: '添加行动' }).click();
  await expect(page.getByLabel('计划日期')).toHaveValue('');
  await expect(page.getByLabel('预计投入（分钟，可留空）')).toHaveValue('');
});

test('record creation falls back when crypto.randomUUID is unavailable', async ({ page }) => {
  await page.goto('/planner/today');
  const result = await page.evaluate(async () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try { const { uuid } = await import('/src/state.ts'); return uuid(); }
    finally { Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true }); }
  });
  expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('actions can use a non-time completion mode and retain its target', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.getByText('行动状态与完成条件', { exact: true }).click();
  const mode = page.getByLabel('精读一篇文献，记录核心问题与方法的推进方式');
  const target = page.getByLabel('精读一篇文献，记录核心问题与方法的完成条件');
  await mode.selectOption('count');
  await target.fill('累计精读 6 篇，并各写下一个研究问题');
  await expect(page.getByText('次数累计 · 未开始')).toBeVisible();
  await page.reload();
  const task = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).tasks.find((row: { id: string }) => row.id === 't1'));
  expect(task).toMatchObject({ actionMode: 'count', target: '累计精读 6 篇，并各写下一个研究问题' });
});

test('an action keeps short process records without marking it done', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.getByText('推进记录', { exact: true }).click();
  await page.getByText('新增一次推进记录', { exact: true }).first().click();
  await page.getByLabel('精读一篇文献，记录核心问题与方法的本次推进').fill('读完方法部分，摘下三个可复用的实验设计。');
  await page.getByLabel('精读一篇文献，记录核心问题与方法的本次结果').fill('确认了样本选择的两个限制。');
  await page.getByLabel('精读一篇文献，记录核心问题与方法的下一步').fill('对照另一篇文献的样本设计。');
  await page.getByRole('button', { name: '保存本次记录' }).first().click();
  await expect(page.getByText('读完方法部分，摘下三个可复用的实验设计。')).toBeVisible();
  await page.reload();
  const workspace = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!));
  expect(workspace.tasks.find((task: { id: string }) => task.id === 't1').done).toBe(false);
  expect(workspace.actionLogs).toEqual([expect.objectContaining({ taskId: 't1', result: '确认了样本选择的两个限制。' })]);
});

test('a planning node can be paused without changing its action history', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.getByText('目标验收与方向状态', { exact: true }).click();
  await page.getByLabel('研究生阶段 · 研究能力的节点状态').selectOption('paused');
  await expect(page.getByText('暂停表示暂时不投入，但保留原有结构和记录。')).toBeVisible();
  await page.reload();
  const workspace = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!));
  expect(workspace.spaces.find((space: { id: string }) => space.id === 'research')).toMatchObject({ status: 'paused' });
  expect(workspace.tasks.find((task: { id: string }) => task.id === 't1').status).toBe('todo');
});

test('progress keeps the weighted result but explains normalized contribution', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await expect(page.getByText('整体执行进度')).toBeVisible();
  await page.getByText('查看计算与贡献明细').click();
  await expect(page.getByText('同级节点使用相对权重，系统会按同级总和归一化。')).toBeVisible();
  await expect(page.getByText('直属行动', { exact: true })).toBeVisible();
  await expect(page.locator('.progress-breakdown')).toContainText('相对权重 1');
});

test('process and evidence states stay separate from execution progress', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.getByText('行动状态与完成条件', { exact: true }).click();
  const status = page.getByLabel('精读一篇文献，记录核心问题与方法的执行状态');
  const evidence = page.getByLabel('精读一篇文献，记录核心问题与方法的证据状态');
  await status.selectOption('in_progress');
  await evidence.selectOption('recorded');
  await expect(page.getByText('进行中不会计入执行进度 · 已有一次证据')).toBeVisible();
  await status.selectOption('done');
  await page.reload();
  const task = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).tasks.find((row: { id: string }) => row.id === 't1'));
  expect(task).toMatchObject({ done: true, status: 'done', evidenceLevel: 'recorded' });
});

test('materials can be linked to an action as concrete evidence', async ({ page }) => {
  await page.goto('/planner/spaces/research');
  await page.getByText('关联学习资料', { exact: true }).click();
  await page.getByText('行动状态与完成条件', { exact: true }).click();
  const link = page.getByRole('checkbox', { name: /文献阅读笔记\.md/ });
  await link.check();
  await expect(page.getByText('未开始不会计入执行进度 · 已有一次证据')).toBeVisible();
  await page.reload();
  const task = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).tasks.find((row: { id: string }) => row.id === 't1'));
  expect(task.materialIds).toEqual(['m1']);
  expect(task.evidenceLevel).toBe('recorded');
});

test('workspace directory uses separate Markdown records, hashes and graph edges', async ({ page }) => {
  await page.goto('/settings');
  const result = await page.evaluate(async () => {
    const { writeWorkspaceFolder, readWorkspaceFolder } = await import('/src/directory.ts');
    class MemoryDirectory {
      name: string; allow: boolean; files = new Map<string, string>(); dirs = new Map<string, MemoryDirectory>();
      constructor(name: string, allow = true) { this.name = name; this.allow = allow; }
      async requestPermission() { return this.allow ? 'granted' : 'denied'; }
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        if (!this.dirs.has(name)) { if (!options?.create) throw new Error('missing directory'); this.dirs.set(name, new MemoryDirectory(name, this.allow)); }
        return this.dirs.get(name)!;
      }
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!this.files.has(name) && !options?.create) throw new Error('missing file');
        if (!this.files.has(name)) this.files.set(name, '');
        return { getFile: async () => ({ text: async () => this.files.get(name)! }), createWritable: async () => ({ write: async (data: string) => { this.files.set(name, data); }, close: async () => {}, abort: async () => {} }) };
      }
      flatten(prefix = ''): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [name, value] of this.files) out[`${prefix}${name}`] = value;
        for (const [name, directory] of this.dirs) Object.assign(out, directory.flatten(`${prefix}${name}/`));
        return out;
      }
    }
    const workspace = { spaces: [{ id: 'goal1', origin: 'template', parentId: '', kind: 'direction', status: 'paused', title: '研究能力', category: '长期方向', description: '逐步形成研究能力', color: 'sage', icon: 'leaf', milestone: '完成问题定义', definitionOfDone: '写出三个有来源的研究问题' }], tasks: [{ id: 'task1', spaceId: 'goal1', title: '整理研究问题', summary: '记录问题、方法和仍未理解的部分。', done: false, status: 'todo', evidenceLevel: 'none', minutes: 30, date: '2026-10-13', materialIds: ['e1'], actionMode: 'count', target: '整理三个问题并写下来源', weight: 1, difficulty: 1 }], actionLogs: [{ id: 'log1', taskId: 'task1', date: '2026-10-13T08:00:00.000Z', note: '整理了第一个问题。', result: '问题范围更清楚。', blocker: '', next: '继续补充第二个问题。' }], materials: [{ id: 'e1', spaceId: 'goal1', name: '反思', kind: '自述', size: 0, date: '2026-10-13', excerpt: '还需要更多证据。', demo: false }], drafts: [], reviews: [] };
    const root = new MemoryDirectory('知序');
    const first = await writeWorkspaceFolder(root as never, workspace);
    const second = await writeWorkspaceFolder(root as never, workspace);
    const restored = await readWorkspaceFolder(root as never);
    const files = root.flatten();
    root.dirs.get('actions')!.files.set('task1.md', files['actions/task1.md'].replace('整理研究问题', '整理三个研究问题'));
    const externallyEdited = await readWorkspaceFolder(root as never);
    const denied = new MemoryDirectory('denied', false);
    let permissionRejected = false; try { await writeWorkspaceFolder(denied as never, workspace); } catch { permissionRejected = true; }
    return { first, second, restored, files, externallyEdited, permissionRejected };
  });
  expect(Object.keys(result.files)).toEqual(expect.arrayContaining(['workspace.md', '_index.tsv', 'goals/goal1.md', 'actions/task1.md', 'progress/log1.md', 'evidence/e1.md', 'graph/edges.tsv']));
  expect(Object.keys(result.files).some(path => path.endsWith('.json'))).toBe(false);
  expect(result.files['graph/edges.tsv']).toContain('task1\tgoal1\tbelongs_to');
  expect(result.files['actions/task1.md']).toContain('记录问题、方法和仍未理解的部分。');
  expect(result.first.changed).toBe(4); expect(result.second.changed).toBe(0);
  expect(result.restored.workspace.spaces[0].origin).toBe('template');
  expect(result.restored.workspace.tasks[0].title).toBe('整理研究问题');
  expect(result.restored.workspace.materials[0].spaceId).toBe('goal1');
  expect(result.files['graph/edges.tsv']).toContain('e1\tgoal1\tbelongs_to');
  expect(result.files['graph/edges.tsv']).toContain('e1\ttask1\tevidence_for');
  expect(result.files['graph/edges.tsv']).toContain('log1\ttask1\tprogress_for');
  expect(result.restored.workspace.tasks[0].materialIds).toEqual(['e1']);
  expect(result.files['actions/task1.md']).toContain('actionMode: "count"');
  expect(result.files['goals/goal1.md']).toContain('status: "paused"');
  expect(result.restored.workspace.tasks[0]).toMatchObject({ actionMode: 'count', target: '整理三个问题并写下来源' });
  expect(result.restored.workspace.actionLogs[0]).toMatchObject({ taskId: 'task1', note: '整理了第一个问题。' });
  expect(result.restored.workspace.spaces[0]).toMatchObject({ status: 'paused', definitionOfDone: '写出三个有来源的研究问题' });
  expect(result.externallyEdited.workspace.tasks[0].title).toBe('整理三个研究问题');
  expect(result.externallyEdited.externalChanges).toEqual(['actions/task1.md']);
  expect(result.permissionRejected).toBe(true);
});

test('AI proposal is reviewed item by item before it changes the workspace', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('edu.prototype.v1.ai.connections', JSON.stringify([{ id: 'test-connection', name: '测试接口', protocol: 'responses', baseUrl: 'https://example.test/v1', model: 'test-edu-model', apiKey: 'test-key', enabled: true }]));
    localStorage.setItem('edu.prototype.v1.ai.active', 'test-connection');
  });
  let requestWorkspace: { spaces: Array<{ id: string }>; tasks: Array<{ spaceId: string }> } | undefined;
  await page.route('**/api/edu/ai/proposal', async route => {
    const body = route.request().postDataJSON() as { workspace: typeof requestWorkspace };
    requestWorkspace = body.workspace;
    return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: {
      summary: '把研究问题整理成一个明确行动。',
      operations: [
        { id: 'op-1', action: 'update', entity: 'space', targetId: 'research', reason: '使里程碑更具体', fields: { title: '研究生阶段 · 研究能力', text: '', category: '长期方向', description: '从提出问题开始', milestone: '明确三个研究问题', color: 'sage', spaceId: '', minutes: 30, date: '', kind: '' } },
        { id: 'op-2', action: 'create', entity: 'task', targetId: 'new-task', reason: '形成近期可执行步骤', fields: { title: '写出三个可验证的研究问题', text: '', category: '', description: '', milestone: '', color: 'sage', spaceId: 'research', minutes: 40, date: '2026-10-13', kind: '' } },
      ],
    } }),
  });
  });
  await page.goto('/planner/ai?scope=research');
  await expect(page.getByLabel('跟进范围')).toHaveAttribute('data-value', 'research');
  await page.getByLabel('你希望怎样调整？').fill('帮我整理研究问题');
  await page.getByRole('button', { name: '生成调整提案' }).click();
  expect(requestWorkspace?.spaces.map(row => row.id)).toEqual(['research']);
  expect(requestWorkspace?.tasks.every(row => row.spaceId === 'research')).toBe(true);
  await expect(page.getByRole('heading', { name: 'AI 调整提案' })).toBeVisible();
  await expect(page.locator('.proposal-content').getByText('写出三个可验证的研究问题')).toBeVisible();
  await page.screenshot({ path: 'output/ai-proposal-desktop.png', fullPage: true });
  await page.locator('.proposal-row').first().getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: '采纳所选 1 项' }).click();
  await page.goto('/planner/today');
  await expect(page.getByText('写出三个可验证的研究问题')).toBeVisible();
  await page.goto('/planner');
  await expect(page.getByText('正在推进：文献阅读与研究问题', { exact: true })).toBeVisible();
});

test('AI connections can be configured and switched from settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('连接名称').fill('本地测试模型');
  await page.getByLabel('Base URL').fill('http://127.0.0.1:11434/v1');
  await page.getByLabel('模型 ID').fill('qwen-local');
  await page.getByRole('button', { name: '添加 AI 接口' }).click();
  await expect(page.getByText('本地测试模型')).toBeVisible();
  await expect(page.getByText('qwen-local')).toBeVisible();
  await page.getByRole('button', { name: '停用' }).click();
  await expect(page.getByText('已停用')).toBeVisible();
  await page.getByRole('button', { name: '启用' }).click();
  await expect(page.getByText('已启用')).toBeVisible();
});

test('planning nodes can be refined and actions keep an editable summary', async ({ page }) => {
  await page.goto('/planner');
  await page.getByRole('link', { name: /查看方向/ }).first().click();
  await page.getByRole('button', { name: '新建子方向', exact: true }).click();
  await page.getByLabel('方向名称').fill('文献阅读计划');
  await page.getByLabel('上级方向 / 计划').click();
  await page.getByRole('option', { name: /研究生阶段/ }).click();
  await page.getByRole('dialog').locator('.planning-settings > summary').click();
  await page.getByLabel('节点类型').selectOption('plan');
  await page.getByLabel('在上级中的分量（1-100）').fill('70');
  await page.getByLabel('节点难度').selectOption('4');
  await page.getByRole('button', { name: '创建子方向' }).click();
  await expect(page).toHaveURL(/\/planner\/spaces\/research$/);
  await expect(page.getByRole('heading', { name: '研究生阶段 · 研究能力' })).toBeVisible();
  await expect(page.getByText('文献阅读计划', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /文献阅读计划/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('文献阅读计划');
  await page.getByRole('button', { name: '安排行动' }).last().click();
  await page.getByLabel('行动内容').fill('整理第一篇文献的研究问题');
  await page.getByText('规划设置', { exact: false }).click();
  await page.getByLabel('行动分量（1-100）').fill('50');
  await page.getByLabel('行动难度').selectOption('3');
  await page.getByText('工作记录与文件（选填）', { exact: true }).click();
  await page.getByLabel('完成证据 / 工作记录').fill('完成后记录问题、方法和仍未理解的部分。');
  await page.getByRole('button', { name: '加入计划' }).click();
  const weighted = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!);
    return { space: workspace.spaces.find((row: { title: string }) => row.title === '文献阅读计划'), task: workspace.tasks.find((row: { title: string }) => row.title === '整理第一篇文献的研究问题') };
  });
  expect(weighted.space.weight).toBe(70); expect(weighted.space.difficulty).toBe(4);
  expect(weighted.task.spaceId).toBe(weighted.space.id);
  expect(weighted.task.weight).toBe(50); expect(weighted.task.difficulty).toBe(3);
  await page.getByRole('link', { name: '让 AI 跟进' }).click();
  await expect(page.getByLabel('大方向', { exact: true })).toHaveAttribute('data-value', 'research');
  await expect(page.getByLabel('跟进范围')).toHaveAttribute('data-value', weighted.space.id);
  await page.getByLabel('大方向', { exact: true }).click();
  await page.getByRole('option', { name: /我的第一篇研究论文/ }).click();
  await page.getByLabel('跟进范围').click();
  await expect(page.getByRole('option', { name: /文献阅读计划/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto(`/planner/spaces/${weighted.space.id}`);
  await page.getByRole('button', { name: '调整行动：整理第一篇文献的研究问题' }).click();
  await expect(page.getByLabel('完成证据 / 工作记录')).toHaveValue('完成后记录问题、方法和仍未理解的部分。');
});

test('records can be adjusted or explicitly deleted', async ({ page }) => {
  await page.goto('/planner/materials');
  await page.getByRole('button', { name: '调整资料：本周研究反思' }).click();
  await page.getByLabel('记录标题').fill('本周研究复盘');
  await page.getByRole('button', { name: '保存记录' }).click();
  await expect(page.getByRole('heading', { name: '本周研究复盘' })).toBeVisible();
  await page.getByRole('button', { name: '删除资料：本周研究复盘' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本周研究复盘' })).toHaveCount(0);
  await page.goto('/planner');
  await page.getByRole('button', { name: '调整我的第一篇研究论文' }).click();
  await page.getByRole('button', { name: '删除方向' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的第一篇研究论文' })).toHaveCount(0);
  await expect(page.getByText('梳理实验变量与需要验证的假设')).toHaveCount(0);
  await page.goto('/planner/today');
  await page.getByLabel('想法草稿').fill('这是一条可以修改的草稿');
  await page.getByRole('button', { name: '记下想法' }).click();
  const draft = page.locator('.saved-draft').filter({ hasText: '这是一条可以修改的草稿' });
  await draft.getByRole('button', { name: '调整' }).click();
  await page.getByLabel('草稿内容').fill('已经修改的草稿');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByText('已经修改的草稿')).toBeVisible();
  await page.locator('.saved-draft').filter({ hasText: '已经修改的草稿' }).getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('已经修改的草稿')).toHaveCount(0);
  await page.getByRole('button', { name: '调整行动：精读一篇文献，记录核心问题与方法' }).click();
  await page.getByRole('button', { name: '删除行动' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('精读一篇文献，记录核心问题与方法')).toHaveCount(0);
  await page.goto('/planner/reviews');
  await page.getByRole('button', { name: '生成执行小结', exact: true }).click();
  await page.getByRole('button', { name: /调整回顾/ }).click();
  await page.getByLabel('回顾标题').fill('可编辑阶段回顾');
  await page.getByRole('button', { name: '保存回顾' }).click();
  await expect(page.getByRole('heading', { name: '可编辑阶段回顾' })).toBeVisible();
  await page.getByRole('button', { name: '删除回顾：可编辑阶段回顾' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '可编辑阶段回顾' })).toHaveCount(0);
});

test('materials stay bounded and are treated as plain text; quality changes context size', async ({ page }) => {
  await page.goto('/planner/materials');
  const text = '<script>alert("no")</script>\n' + '这是一份学习证据。'.repeat(3000);
  await page.getByLabel('选择学习资料').setInputFiles({ name: 'evidence.md', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.getByRole('heading', { name: 'evidence.md' })).toBeVisible();
  const length = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).materials.at(-1).excerpt.length);
  expect(length).toBe(text.length);
  await page.getByRole('button', { name: '写 Markdown' }).click();
  await page.getByLabel('记录标题').fill('本周进度'); await page.getByLabel('内容', { exact: true }).fill('完成了阅读，实验结果仍需验证。');
  await page.getByRole('button', { name: '保存记录' }).click();
  await page.goto('/planner/sync'); await page.getByRole('button', { name: '预览讨论接续包' }).click();
  const standard = (await page.locator('.context-preview').innerText()).length;
  await page.getByRole('button', { name: '调整资料深度' }).click();
  await page.getByRole('radio', { name: /^最高/ }).check();
  await page.goto('/planner/sync'); await page.getByRole('button', { name: '预览讨论接续包' }).click();
  expect((await page.locator('.context-preview').innerText()).length).toBeGreaterThan(standard);
  await expect(page.locator('.context-preview')).toContainText('片段已截短');
});

test('unsupported browser explains that a desktop directory picker is required', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }); });
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: '选择目录', exact: true })).toBeDisabled();
  await expect(page.getByText('当前浏览器不支持选择文件夹。请使用桌面版 Chrome 或 Edge 的安全页面打开。')).toBeVisible();
});

test('mobile routes do not overflow, and menu and modal work by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/planner', '/planner/spaces/research', '/planner/today', '/planner/materials', '/planner/reviews', '/planner/ai', '/planner/sync', '/settings']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
  await page.goto('/planner');
  await page.screenshot({ path: 'output/planner-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('button', { name: '载入浏览器内示例' }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({ path: 'output/settings-mobile.png', fullPage: true });
});

test('reviews reflect execution and resetting is explicit and scoped', async ({ page }) => {
  await page.goto('/planner/reviews');
  await page.getByRole('button', { name: '生成执行小结', exact: true }).click();
  await expect(page.locator('.review-card')).toContainText('其中 1 个已勾选完成');
  await page.goto('/settings');
  await page.evaluate(() => localStorage.setItem('unrelated-project-data', 'keep'));
  await page.getByRole('button', { name: '载入浏览器内示例' }).click();
  await page.getByRole('button', { name: '确认恢复示例' }).click();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-project-data'))).toBe('keep');
  await page.goto('/planner/reviews'); await expect(page.locator('.review-card')).toHaveCount(0);
});

test('planning settings remain user-editable and clearing only removes the browser workspace', async ({ page }) => {
  await page.goto('/planner');
  await page.getByRole('button', { name: '新建大方向', exact: true }).click();
  await page.getByLabel('方向名称').fill('可调整的项目');
  await page.getByRole('dialog').locator('.planning-settings > summary').click();
  await page.getByLabel('节点类型').selectOption('project');
  await page.getByLabel('在上级中的分量（1-100）').fill('35');
  await page.getByLabel('节点难度').selectOption('4');
  await page.getByRole('button', { name: '创建大方向' }).click();
  await page.getByRole('button', { name: '调整可调整的项目' }).click();
  await expect(page.getByLabel('节点类型')).toHaveValue('project');
  await expect(page.getByLabel('在上级中的分量（1-100）')).toHaveValue('35');
  await page.getByRole('button', { name: '取消' }).click();
  await page.goto('/settings');
  await page.evaluate(() => localStorage.setItem('unrelated-project-data', 'keep'));
  await page.getByRole('button', { name: '清空浏览器工作区' }).click();
  await page.getByRole('button', { name: '确认清空工作区' }).click();
  await expect(page.getByRole('button', { name: '创建第一份计划' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-project-data'))).toBe('keep');
});