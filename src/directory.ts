import { getOriginal, saveOriginal, sourceHash, originalFields } from './materialFiles';
import { readGuide } from './materialSearch';
import { defaultScheduleSettings, type Workspace } from './state';
import { validateAssessment } from './assessment';

interface WritableFile { write(data: string | Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }
interface FileHandle { getFile(): Promise<File>; createWritable(): Promise<WritableFile> }
export interface DirectoryHandle {
  name: string;
  requestPermission(options: { mode: 'readwrite' }): Promise<string>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
}
declare global { interface Window { showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<DirectoryHandle> } }

type RecordKind = 'goal' | 'task' | 'log' | 'material' | 'draft' | 'review' | 'schedule';
type IndexRow = { kind: RecordKind; id: string; path: string; hash: string };
const KIND_DIR: Record<RecordKind, string> = { goal: 'goals', task: 'actions', log: 'progress', material: 'evidence', draft: 'drafts', review: 'reviews', schedule: 'schedule' };
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('edu-workspace-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法保存目录授权，可重新选择目录。'));
  });
}
async function setHandle(value?: DirectoryHandle) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      if (value) tx.objectStore('handles').put(value, 'workspace'); else tx.objectStore('handles').delete('workspace');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('目录绑定未保存')); tx.onabort = () => reject(new Error('目录绑定已中止'));
    });
  } finally { db.close(); }
}
export async function loadDirectory(): Promise<DirectoryHandle | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const r = db.transaction('handles').objectStore('handles').get('workspace'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
  finally { db.close(); }
}
export async function chooseDirectory() {
  if (!window.isSecureContext) throw new Error('局域网 HTTP 地址不能授权读写文件夹。请在本机使用 http://localhost:4180 的 Chrome 或 Edge 选择目录；局域网链接可继续用于页面测试。');
  if (!window.showDirectoryPicker) throw new Error('当前浏览器不支持目录工作区。请在桌面版 Chrome 或 Edge 的安全页面中打开。');
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'edu-study-workspace' });
  await setHandle(handle); return handle;
}
export const disconnectDirectory = () => setHandle();

async function ensurePermission(handle: DirectoryHandle) {
  if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('需要目录读写授权才能打开工作区。');
}
async function directoryAt(root: DirectoryHandle, path: string, create = false) {
  let current = root;
  for (const segment of path.split('/').filter(Boolean)) current = await current.getDirectoryHandle(segment, { create });
  return current;
}
async function fileAt(root: DirectoryHandle, path: string, create = false) {
  const parts = path.split('/');
  const name = parts.pop();
  if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name) || !parts.every(part => VALID_ID.test(part))) throw new Error('工作区索引包含无效路径。');
  return (await directoryAt(root, parts.join('/'), create)).getFileHandle(name, { create });
}
async function readText(root: DirectoryHandle, path: string) { return (await (await fileAt(root, path)).getFile()).text(); }
async function writeText(root: DirectoryHandle, path: string, content: string) {
  const writer = await (await fileAt(root, path, true)).createWritable();
  try { await writer.write(content); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch { /* best effort */ } throw error; }
}
async function sha256(content: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}
function scalar(value: unknown) { return JSON.stringify(value); }
function recordFile(kind: RecordKind, fields: Record<string, unknown>, body = '') {
  return ['---', 'schema: 1', `type: ${scalar(kind)}`, ...Object.entries(fields).map(([key, value]) => `${key}: ${scalar(value)}`), '---', body.trim(), ''].join('\n');
}
export function materialMarkdown(row: Workspace['materials'][number]) {
  return recordFile('material', { spaceId: row.spaceId || '', id: row.id, name: row.name, kind: row.kind, size: row.size, date: row.date, demo: row.demo, ...originalFields(row), ...(row.referenceIds?.length ? { referenceIds: row.referenceIds } : {}), ...(row.guide ? { guide: row.guide } : {}) }, row.excerpt);
}
function parseRecord(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('工作区记录缺少有效的元数据区。');
  const fields: Record<string, unknown> = {};
  for (const line of match[1]!.split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error('工作区记录元数据格式无效。');
    try { fields[line.slice(0, separator).trim()] = JSON.parse(line.slice(separator + 1).trim()); }
    catch { throw new Error('工作区记录元数据无法解析。'); }
  }
  return { fields, body: match[2]!.trim() };
}
function serializeWorkspace(workspace: Workspace) {
  const records: Array<{ kind: RecordKind; id: string; path: string; content: string }> = [];
  for (const row of workspace.spaces) records.push({ kind: 'goal', id: row.id, path: `goals/${row.id}.md`, content: recordFile('goal', { ...(row.origin ? { origin: row.origin } : {}), id: row.id, parentId: row.parentId || '', kind: row.kind || 'direction', status: row.status || 'active', title: row.title, category: row.category, color: row.color, icon: row.icon, milestone: row.milestone, definitionOfDone: row.definitionOfDone || '', weight: row.weight || 1, difficulty: row.difficulty || 1 }, row.description) });
  for (const row of workspace.tasks) records.push({ kind: 'task', id: row.id, path: `actions/${row.id}.md`, content: recordFile('task', { id: row.id, goalId: row.spaceId, title: row.title, done: row.status === 'done', status: row.status || (row.done ? 'done' : 'todo'), evidenceLevel: row.evidenceLevel || 'none', materialIds: row.materialIds || [], actionMode: row.actionMode || (row.date ? 'scheduled' : 'deliverable'), target: row.target || '', minutes: row.minutes, date: row.date, weight: row.weight || 1, difficulty: row.difficulty || 1 }, row.summary || '') });
  for (const row of workspace.actionLogs) records.push({ kind: 'log', id: row.id, path: `progress/${row.id}.md`, content: recordFile('log', { id: row.id, taskId: row.taskId, date: row.date, result: row.result, blocker: row.blocker, next: row.next }, row.note) });
  for (const row of workspace.materials) records.push({ kind: 'material', id: row.id, path: `evidence/${row.id}.md`, content: materialMarkdown(row) });
  for (const row of workspace.drafts) records.push({ kind: 'draft', id: row.id, path: `drafts/${row.id}.md`, content: recordFile('draft', { spaceId: row.spaceId || '', id: row.id, date: row.date, applied: row.applied }, row.text) });
  for (const row of workspace.reviews) records.push({ kind: 'review', id: row.id, path: `reviews/${row.id}.md`, content: recordFile('review', { spaceId: row.spaceId || '', id: row.id, title: row.title, date: row.date, ...(row.assessment ? { assessment: row.assessment } : {}) }, row.body) });
  const scheduleRows = workspace.schedule || [];
  const scheduleSettings = workspace.scheduleSettings || defaultScheduleSettings();
  for (const row of scheduleRows) records.push({ kind: 'schedule', id: row.id, path: `schedule/${row.id}.md`, content: recordFile('schedule', { id: row.id, title: row.title, date: row.date, start: row.start, end: row.end, entryType: row.type, category: row.category, spaceId: row.spaceId, taskId: row.taskId, allDay: row.allDay }, row.note) });
  if (scheduleRows.length || JSON.stringify(scheduleSettings) !== JSON.stringify(defaultScheduleSettings())) records.push({ kind: 'schedule', id: 'settings', path: 'schedule/settings.md', content: recordFile('schedule', { id: 'settings', ...scheduleSettings }) });
  return records;
}
function parseIndex(content: string) {
  const rows = content.trim().split('\n').slice(1).filter(Boolean).map(line => {
    const [kind, id, path, hash] = line.split('\t');
    if (!['goal', 'task', 'log', 'material', 'draft', 'review', 'schedule'].includes(kind || '') || !id || !VALID_ID.test(id) || !path || !hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('工作区索引格式无效。');
    if (path !== `${KIND_DIR[kind as RecordKind]}/${id}.md`) throw new Error('工作区索引路径不匹配。');
    return { kind: kind as RecordKind, id, path, hash };
  });
  if (new Set(rows.map(row => `${row.kind}:${row.id}`)).size !== rows.length) throw new Error('工作区索引存在重复记录。');
  return rows;
}
function stringField(fields: Record<string, unknown>, name: string) { if (typeof fields[name] !== 'string') throw new Error(`记录字段 ${name} 无效。`); return fields[name] as string; }
function numberField(fields: Record<string, unknown>, name: string, fallback?: number) { if (fields[name] === undefined && fallback !== undefined) return fallback; if (typeof fields[name] !== 'number') throw new Error(`记录字段 ${name} 无效。`); return fields[name] as number; }
function booleanField(fields: Record<string, unknown>, name: string) { if (typeof fields[name] !== 'boolean') throw new Error(`记录字段 ${name} 无效。`); return fields[name] as boolean; }

function fileLabel(value: string) {
  return value.replace(/[^\p{L}\p{N}·._ -]/gu, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 48) || '文件';
}
function originalLocation(workspace: Workspace, material: Workspace['materials'][number]) {
  const parents: string[] = [];
  const seen = new Set<string>();
  let node = workspace.spaces.find(s => s.id === material.spaceId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id); parents.unshift(fileLabel(node.title) + '_' + fileLabel(node.id));
    node = workspace.spaces.find(s => s.id === node!.parentId);
  }
  const filename = material.sourceName || material.name;
  const extension = /\.[a-z0-9]{1,12}$/i.exec(filename)?.[0] || '';
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  return { path: ['originals', ...(parents.length ? parents : ['总文件库'])].join('/'),
    name: fileLabel(stem) + '-' + material.sourceHash + extension };
}
async function syncOriginal(root: DirectoryHandle, workspace: Workspace, material: Workspace['materials'][number], writing: boolean) {
  if (!material.sourceHash) return;
  const { path, name } = originalLocation(workspace, material);
  let folder: DirectoryHandle | undefined;
  let disk: File | undefined;
  try {
    folder = await directoryAt(root, path, writing);
    disk = await (await folder.getFileHandle(name)).getFile();
  } catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
  if (disk) {
    if (await sourceHash(disk) !== material.sourceHash) throw new Error(path + '/' + name + ' 的原文件已变化，请核对。');
    if (!writing && !await getOriginal(material.sourceHash)) await saveOriginal(material.sourceHash, disk);
    return;
  }
  if (!writing) return path + '/' + name;
  const blob = await getOriginal(material.sourceHash);
  if (!blob || !folder) throw new Error(material.name + ' 的原文件未保存在此浏览器，请重新导入原件后再写入。');
  const writer = await (await folder.getFileHandle(name, { create: true })).createWritable();
  try { await writer.write(blob); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch { /* original error */ } throw error; }
}

export async function writeWorkspaceFolder(handle: DirectoryHandle, workspace: Workspace, protectExternalChanges = false) {
  await ensurePermission(handle);
  const records = serializeWorkspace(workspace);
  let previous = new Map<string, string>();
  try { previous = new Map(parseIndex(await readText(handle, '_index.tsv')).map(row => [row.path, row.hash])); }
  catch (cause) { if (protectExternalChanges && !(cause instanceof DOMException && cause.name === 'NotFoundError')) throw new Error('目录索引无法读取，已暂停自动写入，请先到设置检查目录。'); }
  if (protectExternalChanges) {
    const pending = new Map(records.map(r => [r.path, r.content]));
    for (const [path, hash] of previous) {
      let current: string;
      try { current = await readText(handle, path); } catch { throw new Error(`${path} 已在目录中移动或删除，请先从目录读取核对。`); }
      const currentHash = await sha256(current);
      if ((!pending.has(path)) || (currentHash !== hash && current !== pending.get(path))) throw new Error(`${path} 存在本地修改或仅在目录中存在，已保留文件。请先从目录读取核对。`);
    }
    for (const record of records.filter(r => !previous.has(r.path))) {
      let existing: string | undefined;
      try { existing = await readText(handle, record.path); } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'NotFoundError')) throw cause; }
      if (existing !== undefined && existing !== record.content) throw new Error(`${record.path} 已有未登记文件，请先备份或核对。`);
    }
  }
  for (const material of workspace.materials) await syncOriginal(handle, workspace, material, true);
  const indexRows: IndexRow[] = [];
  let changed = 0;
  for (const record of records) {
    const hash = await sha256(record.content);
    indexRows.push({ kind: record.kind, id: record.id, path: record.path, hash });
    if (previous.get(record.path) !== hash) { await writeText(handle, record.path, record.content); changed++; }
  }
  const edges = ['from\tto\trelation', ...workspace.spaces.filter(space => space.parentId).map(space => `${space.id}\t${space.parentId}\tcontains`), ...workspace.tasks.map(task => `${task.id}\t${task.spaceId}\tbelongs_to`), ...workspace.actionLogs.map(log => `${log.id}\t${log.taskId}\tprogress_for`), ...workspace.materials.flatMap(m => (m.referenceIds || []).map(id => `${m.id}\t${id}\treferenced_by`)), ...workspace.tasks.flatMap(task => (task.materialIds || []).map(materialId => `${materialId}\t${task.id}\tevidence_for`)), ...[...workspace.materials, ...workspace.drafts, ...workspace.reviews].filter(row => row.spaceId).map(row => `${row.id}\t${row.spaceId}\tbelongs_to`), ...(workspace.schedule || []).flatMap(entry => [entry.spaceId ? `${entry.id}\t${entry.spaceId}\tbelongs_to` : '', entry.taskId ? `${entry.id}\t${entry.taskId}\tscheduled_for` : '']).filter(Boolean), ''].join('\n');
  await writeText(handle, 'graph/edges.tsv', edges);
  const overview = ['# 知序工作区', '', '这里按记录保存目标、行动、行动推进、证据、讨论草稿、阶段回顾和日程。每条记录都是可直接阅读的 Markdown；`_index.tsv` 是当前有效记录清单，`graph/edges.tsv` 描述记录之间的关系。', '', '导入的原件保存在 originals 下，按总文件库或所属目标的层级归档。资料导读和可检索正文保存在 evidence 中。请让 AI 优先读取 `workspace.md` 和 `_index.tsv`，再按需要展开具体文件。不要把文件是否存在直接当作目标已完成。', '', `最近写入：${new Date().toISOString()}`, `目标 ${workspace.spaces.length} · 行动 ${workspace.tasks.length} · 推进记录 ${workspace.actionLogs.length} · 证据 ${workspace.materials.length} · 草稿 ${workspace.drafts.length} · 回顾 ${workspace.reviews.length} · 日程 ${(workspace.schedule || []).length}`, ''].join('\n');
  await writeText(handle, 'workspace.md', overview);
  const index = ['kind\tid\tpath\tsha256', ...indexRows.map(row => `${row.kind}\t${row.id}\t${row.path}\t${row.hash}`), ''].join('\n');
  await writeText(handle, '_index.tsv', index); // Commit marker: always written last.
  return { changed, unchanged: records.length - changed, records: records.length };
}

export async function readWorkspaceFolder(handle: DirectoryHandle): Promise<{ workspace: Workspace; externalChanges: string[] }> {
  await ensurePermission(handle);
  const rows = parseIndex(await readText(handle, '_index.tsv'));
  const workspace: Workspace = { spaces: [], tasks: [], actionLogs: [], materials: [], drafts: [], reviews: [], schedule: [], scheduleSettings: defaultScheduleSettings() };
  const externalChanges: string[] = [];
  for (const row of rows) {
    const content = await readText(handle, row.path);
    if (await sha256(content) !== row.hash) externalChanges.push(row.path);
    const { fields, body } = parseRecord(content);
    if (fields.schema !== 1 || fields.type !== row.kind || fields.id !== row.id) throw new Error(`${row.path} 的记录身份不匹配。`);
    if (row.kind === 'goal') workspace.spaces.push({ origin: fields.origin === 'demo' || fields.origin === 'template' ? fields.origin : undefined, id: row.id, parentId: typeof fields.parentId === 'string' ? fields.parentId : '', kind: (['direction', 'plan', 'stage', 'project', 'branch'].includes(String(fields.kind)) ? String(fields.kind) : 'direction') as Workspace['spaces'][number]['kind'], status: ['active', 'paused', 'backlog', 'completed'].includes(String(fields.status)) ? String(fields.status) as Workspace['spaces'][number]['status'] : 'active', title: stringField(fields, 'title'), category: stringField(fields, 'category'), description: body, color: stringField(fields, 'color'), icon: stringField(fields, 'icon'), milestone: stringField(fields, 'milestone'), definitionOfDone: fields.definitionOfDone === undefined ? '' : stringField(fields, 'definitionOfDone'), weight: numberField(fields, 'weight', 1), difficulty: numberField(fields, 'difficulty', 1) });
    if (row.kind === 'task') { const done = booleanField(fields, 'done'); const date = stringField(fields, 'date'); const status = ['todo', 'in_progress', 'pending_verification', 'done', 'blocked', 'adjusted'].includes(String(fields.status)) ? String(fields.status) as Workspace['tasks'][number]['status'] : done ? 'done' : 'todo'; const evidenceLevel = ['none', 'recorded', 'independent', 'stable'].includes(String(fields.evidenceLevel)) ? String(fields.evidenceLevel) as Workspace['tasks'][number]['evidenceLevel'] : 'none'; const actionMode = ['scheduled', 'deliverable', 'count', 'trigger', 'habit'].includes(String(fields.actionMode)) ? String(fields.actionMode) as Workspace['tasks'][number]['actionMode'] : date ? 'scheduled' : 'deliverable'; const materialIds = Array.isArray(fields.materialIds) && fields.materialIds.every(value => typeof value === 'string') ? fields.materialIds : []; workspace.tasks.push({ id: row.id, spaceId: stringField(fields, 'goalId'), title: stringField(fields, 'title'), summary: body, done: status === 'done', status, evidenceLevel, materialIds, actionMode, target: typeof fields.target === 'string' ? fields.target : '', minutes: numberField(fields, 'minutes'), date, weight: numberField(fields, 'weight', 1), difficulty: numberField(fields, 'difficulty', 1) }); }
    if (row.kind === 'log') workspace.actionLogs.push({ id: row.id, taskId: stringField(fields, 'taskId'), date: stringField(fields, 'date'), note: body, result: typeof fields.result === 'string' ? fields.result : '', blocker: typeof fields.blocker === 'string' ? fields.blocker : '', next: typeof fields.next === 'string' ? fields.next : '' });
    if (row.kind === 'material') workspace.materials.push({ ...originalFields(fields), referenceIds: Array.isArray(fields.referenceIds) ? fields.referenceIds.filter((id): id is string => typeof id === 'string') : undefined, guide: externalChanges.includes(row.path) ? undefined : readGuide(fields.guide), spaceId: stringField(fields, 'spaceId'), id: row.id, name: stringField(fields, 'name'), kind: stringField(fields, 'kind'), size: numberField(fields, 'size'), date: stringField(fields, 'date'), excerpt: body, demo: booleanField(fields, 'demo') });
    if (row.kind === 'draft') workspace.drafts.push({ spaceId: stringField(fields, 'spaceId'), id: row.id, text: body, date: stringField(fields, 'date'), applied: booleanField(fields, 'applied') });
    if (row.kind === 'review') workspace.reviews.push({ spaceId: stringField(fields, 'spaceId'), id: row.id, title: stringField(fields, 'title'), date: stringField(fields, 'date'), body, assessment: validateAssessment(fields.assessment) });
    if (row.kind === 'schedule' && row.id === 'settings') workspace.scheduleSettings = { sleepStart: stringField(fields, 'sleepStart'), sleepEnd: stringField(fields, 'sleepEnd'), workStart: stringField(fields, 'workStart'), workEnd: stringField(fields, 'workEnd'), restMinutes: numberField(fields, 'restMinutes'), mealMinutes: numberField(fields, 'mealMinutes'), commuteMinutes: numberField(fields, 'commuteMinutes'), ...(Array.isArray(fields.baselines) ? { baselines: fields.baselines } : {}), ...(Array.isArray(fields.calendarHolidays) ? { calendarHolidays: fields.calendarHolidays } : {}) } as Workspace['scheduleSettings'];
    if (row.kind === 'schedule' && row.id !== 'settings') workspace.schedule.push({ id: row.id, title: stringField(fields, 'title'), date: stringField(fields, 'date'), start: stringField(fields, 'start'), end: stringField(fields, 'end'), type: ['schedule', 'important', 'holiday'].includes(String(fields.entryType)) ? String(fields.entryType) as Workspace['schedule'][number]['type'] : 'schedule', category: ['sleep', 'work', 'rest', 'study', 'personal', 'appointment', 'other'].includes(String(fields.category)) ? String(fields.category) as Workspace['schedule'][number]['category'] : 'other', note: body, spaceId: typeof fields.spaceId === 'string' ? fields.spaceId : '', taskId: typeof fields.taskId === 'string' ? fields.taskId : '', allDay: typeof fields.allDay === 'boolean' ? fields.allDay : false });
  }
  for (const material of workspace.materials) {
    const missing = await syncOriginal(handle, workspace, material, false);
    if (missing) externalChanges.push(missing);
  }
  return { workspace, externalChanges };
}
