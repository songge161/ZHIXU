import { readGuide, planningMaterials, type Guide } from './materialSearch';
import { originalFields } from './materialFiles';
import { appendHistory, readHistory, reverseChanges, workspaceChanges, type HistoryEntry } from './history';
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { validateAssessment, type Assessment } from './assessment';

export type Mode = 'standard' | 'high' | 'highest';
export type SpaceKind = 'direction' | 'plan' | 'stage' | 'project' | 'branch';
export type SpaceStatus = 'active' | 'paused' | 'backlog' | 'completed';
export type TaskStatus = 'todo' | 'in_progress' | 'pending_verification' | 'done' | 'blocked' | 'adjusted';
export type EvidenceLevel = 'none' | 'recorded' | 'independent' | 'stable';
export type ActionMode = 'scheduled' | 'deliverable' | 'count' | 'trigger' | 'habit';
export type ScheduleEntryType = 'schedule' | 'important' | 'holiday';
export type ScheduleCategory = 'sleep' | 'work' | 'rest' | 'study' | 'personal' | 'appointment' | 'other';
export type ScheduleBaselineType = 'sleep' | 'work' | 'rest' | 'meal' | 'commute' | 'custom';
export type CalendarHolidayKind = 'holiday' | 'makeup-workday' | 'weekend';
export interface Space { origin?: 'demo' | 'template'; id: string; parentId: string; kind: SpaceKind; status: SpaceStatus; title: string; category: string; description: string; color: string; icon: string; milestone: string; definitionOfDone: string; weight: number; difficulty: number }
export interface Task { id: string; spaceId: string; title: string; summary: string; done: boolean; status: TaskStatus; evidenceLevel: EvidenceLevel; materialIds: string[]; actionMode: ActionMode; target: string; minutes: number; date: string; weight: number; difficulty: number }
export interface ActionLog { id: string; taskId: string; date: string; note: string; result: string; blocker: string; next: string }
export interface Material { extractionNote?: string; referenceIds?: string[]; guide?: Guide; sourceHash?: string; sourceName?: string; spaceId?: string; id: string; name: string; kind: string; size: number; date: string; excerpt: string; demo: boolean }
export interface Draft { spaceId?: string; id: string; text: string; date: string; applied: boolean }
export interface Review { spaceId?: string; id: string; title: string; date: string; body: string; assessment?: Assessment }
export interface ScheduleEntry { id: string; title: string; date: string; start: string; end: string; type: ScheduleEntryType; category: ScheduleCategory; note: string; spaceId: string; taskId: string; allDay: boolean }
export interface ScheduleBaseline { id: string; title: string; type: ScheduleBaselineType; mode: 'time' | 'minutes'; start: string; end: string; minutes: number; enabled: boolean; workdaysOnly?: boolean }
export interface CalendarHoliday { date: string; name: string; kind: CalendarHolidayKind; source: string; updatedAt: string }
export interface ScheduleSettings { sleepStart: string; sleepEnd: string; workStart: string; workEnd: string; restMinutes: number; mealMinutes: number; commuteMinutes: number; baselines: ScheduleBaseline[]; calendarHolidays: CalendarHoliday[] }
export interface Workspace { spaces: Space[]; tasks: Task[]; actionLogs: ActionLog[]; materials: Material[]; drafts: Draft[]; reviews: Review[]; schedule: ScheduleEntry[]; scheduleSettings: ScheduleSettings }
export interface DirectoryWriteStatus { revision?: string; at: string; directoryName: string; changed: number; unchanged: number; records: number }
const DATA_KEY = 'edu.prototype.v1.workspace';
const PREFS_KEY = 'edu.prototype.v1.preferences';
export const storageError = ref('');
export const uuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const day = () => new Date().toLocaleDateString('sv-SE');
export const timeLabel = (date: string) => new Date(date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export const bytesLabel = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export const defaultScheduleSettings = (): ScheduleSettings => ({
  sleepStart: '23:30', sleepEnd: '07:30', workStart: '09:00', workEnd: '18:00', restMinutes: 60, mealMinutes: 90, commuteMinutes: 60,
  baselines: [
    { id: 'sleep', title: '睡眠', type: 'sleep', mode: 'time', start: '23:30', end: '07:30', minutes: 0, enabled: true },
    { id: 'work', title: '工作', type: 'work', mode: 'time', start: '09:00', end: '18:00', minutes: 0, enabled: true },
    { id: 'rest', title: '休息 / 放空', type: 'rest', mode: 'minutes', start: '', end: '', minutes: 60, enabled: true },
    { id: 'meal', title: '吃饭', type: 'meal', mode: 'minutes', start: '', end: '', minutes: 90, enabled: true },
    { id: 'commute', title: '通勤 / 移动', type: 'commute', mode: 'minutes', start: '', end: '', minutes: 60, enabled: true },
  ],
  calendarHolidays: [],
});
const clone = <T>(data: T): T => JSON.parse(JSON.stringify(data));
function read(key: string): unknown {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { storageError.value = '浏览器缓存无法读取；可以从已选工作区目录重新载入。'; return null; }
}
const demoSpaces: Space[] = [
  { id: 'research', origin: 'demo', parentId: '', kind: 'direction', status: 'active', title: '研究生阶段 · 研究能力', category: '长期方向', description: '从提出一个好问题，到独立完成一次研究。', color: 'sage', icon: 'leaf', definitionOfDone: '', milestone: '正在推进：文献阅读与研究问题', weight: 1, difficulty: 4 },
  { id: 'paper', origin: 'demo', parentId: '', kind: 'direction', status: 'active', title: '我的第一篇研究论文', category: '研究项目', description: '把想法变成可验证的实验与清晰的表达。', color: 'sand', icon: 'file', definitionOfDone: '', milestone: '下一里程碑：完成实验方案', weight: 1, difficulty: 4 },
  { id: 'language', origin: 'demo', parentId: '', kind: 'direction', status: 'active', title: '英语 · 学术表达', category: '阶段学习', description: '更自如地阅读、讨论和表达研究想法。', color: 'lavender', icon: 'book', definitionOfDone: '', milestone: '本阶段：精读与口头复述', weight: 1, difficulty: 2 },
];

export function spaceOriginLabel(space: Space) {
  if (space.origin === 'template') return '来自模板';
  // Older workspaces did not persist the source of the built-in examples.
  if (space.origin === 'demo' || demoSpaces.some(seed => seed.id === space.id && seed.title === space.title && seed.description === space.description)) return '内置示例';
  return '';
}
function initialData(): Workspace {
  const today = day();
  return {
    spaces: clone(demoSpaces),
    tasks: [
      { id: 't1', spaceId: 'research', title: '精读一篇文献，记录核心问题与方法', summary: '', done: false, status: 'todo', evidenceLevel: 'none', materialIds: [], actionMode: 'scheduled', target: '记录核心问题与方法', minutes: 45, date: day(), weight: 1, difficulty: 2 },
      { id: 't2', spaceId: 'paper', title: '梳理实验变量与需要验证的假设', summary: '', done: false, status: 'todo', evidenceLevel: 'none', materialIds: [], actionMode: 'deliverable', target: '形成一份变量与假设清单', minutes: 30, date: day(), weight: 1, difficulty: 3 },
      { id: 't3', spaceId: 'language', title: '用英语复述今天读到的一段摘要', summary: '', done: true, status: 'done', evidenceLevel: 'none', materialIds: [], actionMode: 'habit', target: '完成一次口头复述', minutes: 15, date: day(), weight: 1, difficulty: 1 },
    ],
    actionLogs: [],
    materials: [
      { id: 'm1', name: '文献阅读笔记.md', kind: '个人成果', size: 0, date: day(), excerpt: '示例：记录研究问题、方法，以及还没有理解的部分。此项用于展示，没有关联真实文件。', demo: true },
      { id: 'm2', name: '本周研究反思', kind: '自述', size: 0, date: day(), excerpt: '示例：能说清楚研究问题，但实验比较的方法还需要更多验证。', demo: true },
    ],
    drafts: [], reviews: [],
    schedule: [
      { id: 'schedule-t1', title: '精读一篇文献', date: today, start: '09:30', end: '10:15', type: 'schedule', category: 'study', note: '示例：与今日行动关联，完成后仍需在行动里确认。', spaceId: 'research', taskId: 't1', allDay: false },
      { id: 'schedule-t2', title: '梳理实验变量', date: today, start: '14:00', end: '14:30', type: 'schedule', category: 'study', note: '示例：一段可调整的专注时间。', spaceId: 'paper', taskId: 't2', allDay: false },
      { id: 'schedule-review', title: '本周研究回顾', date: today, start: '', end: '', type: 'important', category: 'other', note: '示例重要日，可随时编辑或删除。', spaceId: 'research', taskId: '', allDay: true },
    ],
    scheduleSettings: defaultScheduleSettings(),
  };
}
// Directory records are parsed as data and then bounded here before entering reactive state.
export function validateWorkspace(input: unknown): Workspace {
  const fail = (): never => { throw new Error('工作区记录格式无效、关联错误或超出容量限制。'); };
  const object = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : fail();
  const str = (x: unknown, max = 500): string => typeof x === 'string' && x.length <= max ? x : fail();
  const id = (x: unknown) => { const value = str(x, 100); return /^[a-zA-Z0-9_-]+$/.test(value) ? value : fail(); };
  const bool = (x: unknown): boolean => typeof x === 'boolean' ? x : fail();
  const num = (x: unknown, max: number): number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? x : fail();
  const scale = (x: unknown, fallback: number, max: number): number => x === undefined ? fallback : typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= max ? x : fail();
  const list = <T>(x: unknown, max: number, convert: (row: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(x) || x.length > max) return fail();
    const ids = new Set<string>();
    return x.map(row => { const o = object(row); const rowId = id(o.id); if (ids.has(rowId)) return fail(); ids.add(rowId); return convert(o); });
  };
  const d = object(input);
  const spaces = list<Space>(d.spaces, 200, o => ({ origin: o.origin === 'demo' || o.origin === 'template' ? o.origin : undefined, id: id(o.id), parentId: typeof o.parentId === 'string' && o.parentId ? id(o.parentId) : '', kind: (['direction', 'plan', 'stage', 'project', 'branch'].includes(String(o.kind)) ? String(o.kind) : 'direction') as SpaceKind, status: o.status === undefined ? 'active' : ['active', 'paused', 'backlog', 'completed'].includes(String(o.status)) ? String(o.status) as SpaceStatus : fail(), title: str(o.title, 120), category: str(o.category, 40), description: str(o.description), color: ['sage', 'sand', 'lavender'].includes(String(o.color)) ? String(o.color) : 'sage', icon: ['leaf', 'book', 'file', 'target'].includes(String(o.icon)) ? String(o.icon) : 'target', milestone: str(o.milestone), definitionOfDone: o.definitionOfDone === undefined ? '' : str(o.definitionOfDone, 2000), weight: scale(o.weight, 1, 100), difficulty: scale(o.difficulty, 1, 5) }));
  if (spaces.some(space => space.parentId && !spaces.some(parent => parent.id === space.parentId))) return fail();
  const roots = spaces.filter(space => !space.parentId).map(space => space.id);
  const seen = new Set<string>();
  const visit = (id: string) => { if (seen.has(id)) return fail(); seen.add(id); spaces.filter(space => space.parentId === id).forEach(space => visit(space.id)); };
  roots.forEach(visit); if (seen.size !== spaces.length) return fail();
  const taskStatus = (value: unknown, done: boolean): TaskStatus => value === undefined ? (done ? 'done' : 'todo') : ['todo', 'in_progress', 'pending_verification', 'done', 'blocked', 'adjusted'].includes(String(value)) ? String(value) as TaskStatus : fail();
  const evidenceLevel = (value: unknown): EvidenceLevel => value === undefined ? 'none' : ['none', 'recorded', 'independent', 'stable'].includes(String(value)) ? String(value) as EvidenceLevel : fail();
  const actionMode = (value: unknown, date: string): ActionMode => value === undefined ? (date ? 'scheduled' : 'deliverable') : ['scheduled', 'deliverable', 'count', 'trigger', 'habit'].includes(String(value)) ? String(value) as ActionMode : fail();
  const materialIds = (value: unknown): string[] => { if (value === undefined) return []; if (!Array.isArray(value) || value.length > 50) return fail(); const ids = value.map(id); return new Set(ids).size === ids.length ? ids : fail(); };
  const tasks = list(d.tasks, 500, o => { const done = bool(o.done); const date = str(o.date, 40); const status = taskStatus(o.status, done); return { id: id(o.id), spaceId: id(o.spaceId), title: str(o.title, 200), summary: typeof o.summary === 'string' ? str(o.summary, 12000) : '', done: status === 'done', status, evidenceLevel: evidenceLevel(o.evidenceLevel), materialIds: materialIds(o.materialIds), actionMode: actionMode(o.actionMode, date), target: typeof o.target === 'string' ? str(o.target, 500) : '', minutes: num(o.minutes, 1440), date, weight: scale(o.weight, 1, 100), difficulty: scale(o.difficulty, 1, 5) }; });
  if (tasks.some(t => !spaces.some(s => s.id === t.spaceId))) return fail();
  const actionLogs = d.actionLogs === undefined ? [] : list(d.actionLogs, 1000, o => ({ id: id(o.id), taskId: id(o.taskId), date: str(o.date, 40), note: str(o.note, 6000), result: typeof o.result === 'string' ? str(o.result, 2000) : '', blocker: typeof o.blocker === 'string' ? str(o.blocker, 2000) : '', next: typeof o.next === 'string' ? str(o.next, 2000) : '' }));
  if (actionLogs.some(log => !tasks.some(task => task.id === log.taskId))) return fail();
  const materials = list<Material>(d.materials, 50, o => ({ ...originalFields(o), referenceIds: Array.isArray(o.referenceIds) ? [...new Set(o.referenceIds.filter((id): id is string => typeof id === 'string' && id !== o.spaceId && spaces.some(s => s.id === id)))] : undefined, guide: readGuide(o.guide), spaceId: typeof o.spaceId === 'string' && spaces.some(s => s.id === o.spaceId) ? o.spaceId : '', id: id(o.id), name: str(o.name, 200), kind: str(o.kind, 30), size: num(o.size, 100 * 1024 * 1024), date: str(o.date, 40), excerpt: str(o.excerpt, 100000), demo: bool(o.demo) }));
  if (tasks.some(task => task.materialIds.some(materialId => !materials.some(material => material.id === materialId)))) return fail();
  const drafts = list(d.drafts, 50, o => ({ spaceId: typeof o.spaceId === 'string' && spaces.some(s => s.id === o.spaceId) ? o.spaceId : '', id: id(o.id), text: str(o.text, 3000), date: str(o.date, 40), applied: bool(o.applied) }));
  const reviews = list(d.reviews, 30, o => ({ spaceId: typeof o.spaceId === 'string' && spaces.some(s => s.id === o.spaceId) ? o.spaceId : '', id: id(o.id), title: str(o.title, 160), date: str(o.date, 40), body: str(o.body, 6000), assessment: validateAssessment(o.assessment) }));
  const timeValue = (value: unknown, fallback = '') => value === undefined ? fallback : fallback === '' && value === '' ? '' : typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fail();
  const minutesValue = (value: unknown, fallback: number) => value === undefined ? fallback : typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1440 ? value : fail();
  const scheduleSettingsInput = d.scheduleSettings === undefined ? {} : object(d.scheduleSettings);
  const scheduleSettingsLegacy = {
    sleepStart: timeValue(scheduleSettingsInput.sleepStart, '23:30'), sleepEnd: timeValue(scheduleSettingsInput.sleepEnd, '07:30'),
    workStart: timeValue(scheduleSettingsInput.workStart, '09:00'), workEnd: timeValue(scheduleSettingsInput.workEnd, '18:00'),
    restMinutes: minutesValue(scheduleSettingsInput.restMinutes, 60), mealMinutes: minutesValue(scheduleSettingsInput.mealMinutes, 90), commuteMinutes: minutesValue(scheduleSettingsInput.commuteMinutes, 60),
  };
  const baselineType = (value: unknown): ScheduleBaselineType => ['sleep', 'work', 'rest', 'meal', 'commute', 'custom'].includes(String(value)) ? String(value) as ScheduleBaselineType : fail();
  const legacyBaselines: ScheduleBaseline[] = [
    { id: 'sleep', title: '睡眠', type: 'sleep', mode: 'time', start: scheduleSettingsLegacy.sleepStart, end: scheduleSettingsLegacy.sleepEnd, minutes: 0, enabled: true },
    { id: 'work', title: '工作', type: 'work', mode: 'time', start: scheduleSettingsLegacy.workStart, end: scheduleSettingsLegacy.workEnd, minutes: 0, enabled: true },
    { id: 'rest', title: '休息 / 放空', type: 'rest', mode: 'minutes', start: '', end: '', minutes: scheduleSettingsLegacy.restMinutes, enabled: true },
    { id: 'meal', title: '吃饭', type: 'meal', mode: 'minutes', start: '', end: '', minutes: scheduleSettingsLegacy.mealMinutes, enabled: true },
    { id: 'commute', title: '通勤 / 移动', type: 'commute', mode: 'minutes', start: '', end: '', minutes: scheduleSettingsLegacy.commuteMinutes, enabled: true },
  ];
  const baselines = scheduleSettingsInput.baselines === undefined ? legacyBaselines : list(scheduleSettingsInput.baselines, 30, o => ({ id: id(o.id), title: str(o.title, 80), type: baselineType(o.type), mode: o.mode === undefined ? (o.start ? 'time' : 'minutes') : ['time', 'minutes'].includes(String(o.mode)) ? String(o.mode) as 'time' | 'minutes' : fail(), start: timeValue(o.start, ''), end: timeValue(o.end, ''), minutes: minutesValue(o.minutes, 0), enabled: o.enabled === undefined ? true : bool(o.enabled), workdaysOnly: o.workdaysOnly === undefined ? true : bool(o.workdaysOnly) }));
  const holidayKinds: CalendarHolidayKind[] = ['holiday', 'makeup-workday', 'weekend'];
  const calendarHolidays = scheduleSettingsInput.calendarHolidays === undefined ? [] : (() => {
    if (!Array.isArray(scheduleSettingsInput.calendarHolidays) || scheduleSettingsInput.calendarHolidays.length > 2000) return fail();
    const seen = new Set<string>();
    return scheduleSettingsInput.calendarHolidays.map(row => {
      const o = object(row); const date = str(o.date, 40); const key = `${date}:${String(o.source || '')}`;
      if (seen.has(key)) return fail(); seen.add(key);
      return { date, name: str(o.name, 80), kind: holidayKinds.includes(String(o.kind) as CalendarHolidayKind) ? String(o.kind) as CalendarHolidayKind : fail(), source: str(o.source, 80), updatedAt: str(o.updatedAt, 40) };
    });
  })();
  const scheduleSettings: ScheduleSettings = { ...scheduleSettingsLegacy, baselines, calendarHolidays };
  const scheduleType = (value: unknown): ScheduleEntryType => value === undefined ? 'schedule' : ['schedule', 'important', 'holiday'].includes(String(value)) ? String(value) as ScheduleEntryType : fail();
  const scheduleCategory = (value: unknown): ScheduleCategory => value === undefined ? 'other' : ['sleep', 'work', 'rest', 'study', 'personal', 'appointment', 'other'].includes(String(value)) ? String(value) as ScheduleCategory : fail();
  const schedule = d.schedule === undefined ? [] : list(d.schedule, 1000, o => {
    const allDay = o.allDay === undefined ? false : bool(o.allDay);
    const date = str(o.date, 40);
    const start = timeValue(o.start, allDay ? '' : '09:00');
    const end = timeValue(o.end, allDay ? '' : '10:00');
    if (!allDay && start === end) return fail();
    const spaceId = o.spaceId === undefined || o.spaceId === '' ? '' : id(o.spaceId);
    const taskId = o.taskId === undefined || o.taskId === '' ? '' : id(o.taskId);
    if (spaceId && !spaces.some(space => space.id === spaceId)) return fail();
    if (taskId && !tasks.some(task => task.id === taskId)) return fail();
    if (spaceId && taskId && tasks.find(task => task.id === taskId)?.spaceId !== spaceId) return fail();
    return { id: id(o.id), title: str(o.title, 200), date, start: allDay ? '' : start, end: allDay ? '' : end, type: scheduleType(o.type), category: scheduleCategory(o.category), note: typeof o.note === 'string' ? str(o.note, 2000) : '', spaceId: taskId ? tasks.find(task => task.id === taskId)!.spaceId : spaceId, taskId, allDay };
  });
  return { spaces, tasks, actionLogs, materials, drafts, reviews, schedule, scheduleSettings };
}
let loaded = initialData();
let diskVersion: string | null = null;
let entries: HistoryEntry[] = [];
export const lastSaved = ref('');
export const savedRevision = ref('');
try {
  diskVersion = localStorage.getItem(DATA_KEY);
  if (diskVersion) {
    const stored = JSON.parse(diskVersion);
    loaded = validateWorkspace(stored);
    entries = readHistory(stored.history);
    if (typeof stored.savedAt === 'string' && Number.isFinite(Date.parse(stored.savedAt))) lastSaved.value = stored.savedAt;
    if (typeof stored.revision === 'string') savedRevision.value = stored.revision;
  }
} catch { storageError.value = '浏览器工作区无法读取，暂时显示示例。请先保留原有数据。'; }
export const state = reactive<Workspace>(loaded);
export const history = shallowRef(entries);
export const historyNotice = ref('');
let baseline = clone(loaded);

function persistWorkspace(value: Workspace, nextHistory: HistoryEntry[]) {
  let kept = nextHistory;
  const savedAt = new Date().toISOString();
  const revision = uuid();
  try {
    if (localStorage.getItem(DATA_KEY) !== diskVersion) {
      throw new Error('另一页面已更改浏览器工作区，请先保留本页修改，再刷新查看最新内容。');
    }
    for (;;) {
      const serialized = JSON.stringify({ ...value, history: kept, savedAt, revision });
      try { localStorage.setItem(DATA_KEY, serialized); }
      catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError' || !kept.length) throw error;
        kept = kept.slice(0, -1);
        continue;
      }
      diskVersion = serialized;
      break;
    }
  } catch (error) {
    storageError.value = error instanceof Error && !(error instanceof DOMException) ? error.message : '浏览器保存失败，请先将本页内容写入工作区目录。';
    throw new Error(storageError.value);
  }
  history.value = kept;
  baseline = clone(value);
  lastSaved.value = savedAt;
  savedRevision.value = revision;
  storageError.value = '';
  if (kept.length < nextHistory.length) historyNotice.value = '浏览器空间不足，已缩短调整历史。';
}

function saveAdjustment(value: Workspace, label: string) {
  // Normalize legacy defaults and optional fields the same way as a reload.
  const changes = workspaceChanges(validateWorkspace(baseline), validateWorkspace(value));
  if (!changes.length && diskVersion && JSON.stringify(value) === JSON.stringify(baseline)) return;
  let next = history.value;
  if (changes.length) {
    next = appendHistory(next, { id: uuid(), at: new Date().toISOString(), label, changes });
    historyNotice.value = next.length ? '' : '本次调整超过历史容量，已从这里重新记录。';
  }
  persistWorkspace(value, next);
}

// Vue batches the synchronous mutations of one user action, including cascaded deletions.
watch(state, () => {
  if (JSON.stringify(state) === JSON.stringify(baseline) && diskVersion) return;
  try { saveAdjustment(state, '手工调整'); }
  catch (error) { storageError.value = error instanceof Error ? error.message : '浏览器保存失败。'; }
}, { deep: true });
const storedPrefs = read(PREFS_KEY) as { mode?: Mode; directoryWrite?: DirectoryWriteStatus } | null;
const storedDirectoryWrite = storedPrefs?.directoryWrite;
export const preferences = reactive<{ mode: Mode; directoryWrite?: DirectoryWriteStatus }>({
  mode: ['standard', 'high', 'highest'].includes(storedPrefs?.mode || '') ? storedPrefs!.mode! : 'standard',
  directoryWrite: storedDirectoryWrite && typeof storedDirectoryWrite.at === 'string' && typeof storedDirectoryWrite.directoryName === 'string' && Number.isFinite(storedDirectoryWrite.changed) && Number.isFinite(storedDirectoryWrite.unchanged) && Number.isFinite(storedDirectoryWrite.records) ? storedDirectoryWrite : undefined,
});
watch(preferences, () => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)); }
  catch { storageError.value = '浏览器设置保存失败，请检查可用空间。'; }
}, { deep: true });
export function recordDirectoryWrite(status: Omit<DirectoryWriteStatus, 'at'>) { preferences.directoryWrite = { ...status, at: new Date().toISOString() }; }
export const dataSize = computed(() => new Blob([JSON.stringify(state)]).size);
export const completed = computed(() => state.tasks.filter(t => t.done).length);
export const totalMinutes = computed(() => state.tasks.filter(t => !t.done).reduce((sum, t) => sum + t.minutes, 0));
export function replaceWorkspace(value: Workspace, label?: string) {
  const copy = clone(value);
  if (label) saveAdjustment(copy, label);
  else {
    persistWorkspace(copy, []);
    historyNotice.value = '';
  }
  Object.assign(state, copy);
}

export function undoAdjustment(id: string) {
  const entry = history.value[0];
  if (!entry || entry.id !== id) throw new Error('请先撤销更新的调整。');
  if (JSON.stringify(state) !== JSON.stringify(baseline)) throw new Error('本页仍有未保存的修改，请先保存。');
  const restored = validateWorkspace(reverseChanges(validateWorkspace(state), entry));
  persistWorkspace(restored, history.value.slice(1));
  Object.assign(state, restored);
}
export function resetDemo() { replaceWorkspace(initialData()); }
export function clearWorkspace() { replaceWorkspace({ spaces: [], tasks: [], actionLogs: [], materials: [], drafts: [], reviews: [], schedule: [], scheduleSettings: defaultScheduleSettings() }); }
export function downloadFile(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function scopeRecords(scopeId: string) {
  if (scopeId && !state.spaces.some(space => space.id === scopeId)) throw new Error('所选 AI 方向已不存在，请重新选择。');
  if (!scopeId) return { spaces: state.spaces, tasks: state.tasks, actionLogs: state.actionLogs, label: '整个工作区', scoped: false };
  const ids = new Set<string>([scopeId]); let changed = true;
  while (changed) { changed = false; state.spaces.forEach(space => { if (space.parentId && ids.has(space.parentId) && !ids.has(space.id)) { ids.add(space.id); changed = true; } }); }
  const root = state.spaces.find(space => space.id === scopeId)!;
  const tasks = state.tasks.filter(task => ids.has(task.spaceId));
  return { spaces: state.spaces.filter(space => ids.has(space.id)), tasks, actionLogs: state.actionLogs.filter(log => tasks.some(task => task.id === log.taskId)), label: root.title, scoped: true };
}
export function eligibleMaterials(scopeId: string, includeGlobal: boolean, includeChildren = true): Material[] {
  const scoped = scopeRecords(scopeId);
  const children = new Set(includeChildren ? scoped.spaces.map(s => s.id) : [scopeId]);
  const linked = new Set(scoped.tasks.filter(task => children.has(task.spaceId)).flatMap(task => task.materialIds));
  const ancestors = new Set<string>();
  let parent = state.spaces.find(s => s.id === scopeId)?.parentId;
  while (parent && !ancestors.has(parent)) { ancestors.add(parent); parent = state.spaces.find(s => s.id === parent)?.parentId; }
  const priority = (m: Material) => linked.has(m.id) ? -1 : m.spaceId && children.has(m.spaceId) ? 0 : m.spaceId && ancestors.has(m.spaceId) ? 1 : 2;
  return state.materials.filter(m => !scoped.scoped || linked.has(m.id) || m.referenceIds?.some(id => children.has(id) || ancestors.has(id)) || (m.spaceId ? children.has(m.spaceId) || ancestors.has(m.spaceId) : includeGlobal))
    .sort((a, b) => priority(a) - priority(b) || b.date.localeCompare(a.date));
}
export function selectAiMaterials(mode: Mode, scopeId = '', includeGlobal = false) {
  return eligibleMaterials(scopeId, includeGlobal).slice(0, mode === 'standard' ? 3 : mode === 'high' ? 8 : 15);
}
function reviewContext(review: Review): string {
  if (!review.assessment) return review.body;
  const current = state.spaces.find(space => space.id === review.spaceId);
  const stale = !current || current.definitionOfDone !== review.assessment.criteria;
  const missing = review.assessment.evidence.some(row => !state.materials.some(material => material.id === row.id));
  return [stale ? '注意：目标标准已变化或节点已删除，此为历史自评，不能作为当前已达标的结论。' : '以下是用户自评，需要结合实际成果核对。', missing ? '注意：部分关联资料已删除，证据尚待重新核对。' : '', review.body].filter(Boolean).join('\n\n');
}
export function buildContext(mode: Mode, scopeId = '', includeGlobal = false): string {
  const scoped = scopeRecords(scopeId);
  const selected = selectAiMaterials(mode, scopeId, includeGlobal);
  const limit = mode === 'standard' ? 500 : mode === 'high' ? 1800 : 3000;
  const summaryLimit = mode === 'standard' ? 600 : mode === 'high' ? 1400 : 2600;
  const summaryCount = mode === 'standard' ? 6 : mode === 'high' ? 18 : 40;
  const summaryIds = new Set([...scoped.tasks.filter(t => !t.done && t.summary), ...scoped.tasks.filter(t => t.summary).slice(-summaryCount)].map(t => t.id));
  const weighted = (task: Task) => task.weight * (1 + (task.difficulty - 1) * 0.15);
  const completedImpact = scoped.tasks.filter(task => task.done).reduce((total, task) => total + weighted(task), 0);
  const pendingImpact = scoped.tasks.filter(task => !task.done).reduce((total, task) => total + weighted(task), 0);
  const totalImpact = completedImpact + pendingImpact;
  const completedShare = totalImpact ? Math.round(completedImpact / totalImpact * 100) : 0;
  const taskRows = scoped.tasks.map(t => { const linked = state.materials.filter(material => t.materialIds.includes(material.id)).map(material => material.name); const logs = scoped.actionLogs.filter(log => log.taskId === t.id).slice(-3).map(log => `${timeLabel(log.date)}：${log.note}${log.result ? `；结果：${log.result}` : ''}${log.blocker ? `；卡点：${log.blocker}` : ''}${log.next ? `；下一步：${log.next}` : ''}`); return `- [${t.done ? 'x' : ' '}] ${t.id} · ${t.title}（推进方式 ${t.actionMode}，目标/条件：${t.target || '未填写'}；${t.minutes ? `${t.minutes} 分钟计划投入` : '不按时长推进'}，${t.date || '未排日期'}；状态 ${t.status}，证据 ${t.evidenceLevel}${linked.length ? `，关联资料：${linked.join('、')}` : ''}；相对权重 ${t.weight}，难度 ${t.difficulty}/5）${logs.length ? `\n  最近推进：${logs.join(' / ')}` : ''}${summaryIds.has(t.id) ? `\n  行动总结：${t.summary.slice(0, summaryLimit)}${t.summary.length > summaryLimit ? '…[总结已截短]' : ''}` : ''}`; });
  const summaries = scoped.tasks.filter(t => summaryIds.has(t.id)).map(t => `${t.id}：${t.summary.slice(0, summaryLimit)}`);
  return [
    '# 知序 · 本地讨论接续包',
    `生成日期：${day()}。档位：${{ standard: '标准', high: '高', highest: '最高' }[mode]}。AI 范围：${scoped.label}。仅为本地上下文筛选，不切换外部模型。`,
    '本文件为未接云端的原型数据，可能包含示例。请区分事实、自述与建议。不要把生成的计划视为已经完成的学习。',
    '## 当前方向', ...scoped.spaces.map(s => `- ${s.id} | ${s.parentId || '根方向'} | ${s.kind} | ${s.status} | ${s.title}（同层相对权重 ${s.weight}，难度 ${s.difficulty}/5）：${s.description}；完成标准：${s.definitionOfDone || '尚未设置'}`),
    '## 行动记录', ...taskRows,
    '## 当前分量校准', `范围内已完成行动的加权分量为 ${completedImpact.toFixed(1)}，待完成为 ${pendingImpact.toFixed(1)}；已完成部分占当前行动分量的 ${completedShare}%。这是检查前期是否过重的信号，不是要求把已完成记录重写。后续阶段明确、难点变化或新增产出时，可以通过可审查提案调整未完成节点与行动的分量。`,
    '## 最近行动总结索引', ...summaries,
    '## 待讨论草稿', ...state.drafts.filter(d => !d.applied && (!scoped.scoped || scoped.spaces.some(s => s.id === d.spaceId))).slice(-5).map(d => `- ${d.text}`),
    '## 选取的资料摘要', '资料按当前范围、上级资料库、可选总文件库的顺序取样。上级和总文件库仅供参考，不可在子范围内修改；未选取或截短不等于现实中不存在。', ...selected.map(m => `### ${m.name}（${m.kind}${m.demo ? '，示例' : ''}；归属：${state.spaces.find(s => s.id === m.spaceId)?.title || '总文件库'}）\n${m.excerpt.slice(0, limit) || '只有文件信息，尚未读取内容。'}${m.excerpt.length > limit ? '\n[片段已截短，需要时回查原文]' : ''}`),
    '## 最近执行小结', ...state.reviews.filter(r => !scoped.scoped || scoped.spaces.some(s => s.id === r.spaceId)).slice(-2).map(r => reviewContext(r)),
    '## 日程安排', ...state.schedule.filter(entry => entry.date >= day()).slice(0, 20).map(entry => `- ${entry.date} ${entry.allDay ? '全天' : `${entry.start}-${entry.end}`} · ${entry.type === 'holiday' ? '节假日' : entry.type === 'important' ? '重要日' : '日程'} · ${entry.title}${entry.taskId ? `（关联行动 ${entry.taskId}）` : ''}`),
    '## 讨论原则', '以上是背景记录，具体任务以用户本轮请求为准。保留不确定之处，但可以提出标明假设的暂定分支和可执行步骤；不必反复新增澄清行动。未选取的资料和原文件未包含在此包中。',
  ].join('\n\n');
}

export function aiSourceWorkspace(scopeId = '', includeGlobal = false): Workspace {
  const scoped = scopeRecords(scopeId);
  const ids = new Set(scoped.spaces.map(row => row.id));
  const inside = (row: { spaceId?: string }) => !scopeId || ids.has(row.spaceId || '');
  return {
    spaces: scoped.spaces, tasks: scoped.tasks, actionLogs: scoped.actionLogs,
    materials: eligibleMaterials(scopeId, includeGlobal),
    drafts: state.drafts.filter(row => !row.applied && inside(row)),
    reviews: state.reviews.filter(inside),
    schedule: state.schedule.filter(row => row.date >= day() && inside(row)),
    scheduleSettings: state.scheduleSettings,
  };
}

export function buildAiWorkspace(mode: Mode, scopeId = '', includeGlobal = false, scoped = aiSourceWorkspace(scopeId, includeGlobal), question = ''): Workspace {
  const summaryLimit = mode === 'standard' ? 600 : mode === 'high' ? 1400 : 2600;
  const materialLimit = mode === 'standard' ? 500 : mode === 'high' ? 1400 : 2600;
  const materialCount = mode === 'standard' ? 3 : mode === 'high' ? 8 : 15;
  const summaryCount = mode === 'standard' ? 6 : mode === 'high' ? 18 : 40;
  const summaryIds = new Set([...scoped.tasks.filter(task => !task.done && task.summary), ...scoped.tasks.filter(task => task.summary).slice(-summaryCount)].map(task => task.id));
  return {
    spaces: scoped.spaces.map(space => ({ ...space, description: space.description.slice(0, 500), milestone: space.milestone.slice(0, 300) })),
    // Keep every action's stable ID/title so proposals can reference it, but send full summaries only for active or recent actions.
    tasks: scoped.tasks.map(task => ({ ...task, summary: summaryIds.has(task.id) ? task.summary.slice(0, summaryLimit) : '' })),
    actionLogs: scoped.actionLogs.slice(-summaryCount).map(log => ({ ...log, note: log.note.slice(0, summaryLimit), result: log.result.slice(0, 500), blocker: log.blocker.slice(0, 500), next: log.next.slice(0, 500) })),
    materials: planningMaterials(scoped.materials, question, materialCount, materialLimit),
    drafts: scoped.drafts.slice(-5).map(draft => ({ ...draft, text: draft.text.slice(0, 1200) })),
    reviews: scoped.reviews.slice(-2).map(review => ({ ...review, body: reviewContext(review).slice(0, mode === 'standard' ? 1200 : 3000) })),
    schedule: scoped.schedule.slice(0, mode === 'standard' ? 10 : 30),
    scheduleSettings: { ...scoped.scheduleSettings },
  };
}
