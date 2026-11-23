<script setup lang="ts">
import { defineAsyncComponent, computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { minutesLabel } from './formatTime';
import DeleteConfirmation from './components/DeleteConfirmation.vue';
import ValidatedForm from './components/ValidatedForm.vue';
import StarterPlan from './components/StarterPlan.vue';
import ProposalBudget from './components/ProposalBudget.vue';
import { prepareProposal } from './proposalBudget';
import FileImportButton from './components/FileImportButton.vue';
import MaterialGuide from './components/MaterialGuide.vue';
import MaterialQuestions from './components/MaterialQuestions.vue';
import { generateGuide } from './materialAi';
import { extractFile, sourceHash, saveOriginal, getOriginal } from './materialFiles';
import DailyActions from './components/DailyActions.vue';

import Icon from './components/Icon.vue';
import { recordTitle, readableReferences } from './proposalText';
import DirectionPicker from './components/DirectionPicker.vue';
import { proposalIssues } from './proposalScope';
import DirectionOverview from './components/DirectionOverview.vue';
import NodeAssessment from './components/NodeAssessment.vue';
import ProgressPreview from './components/ProgressPreview.vue';
import { actionImpact, calculateProgress } from './progress';
import { proposalWorkspace, previewIdFactory } from './proposalApply';
import { history, undoAdjustment, state, preferences, storageError, spaceOriginLabel, savedRevision, dataSize, completed, totalMinutes, uuid, day, timeLabel, bytesLabel, validateWorkspace, replaceWorkspace, resetDemo, clearWorkspace, downloadFile, buildContext, buildAiWorkspace, aiSourceWorkspace, eligibleMaterials, recordDirectoryWrite, type Workspace, type Draft, type SpaceKind, type SpaceStatus, type Material, type TaskStatus, type EvidenceLevel, type ActionMode, type ScheduleEntry, type ScheduleEntryType, type ScheduleCategory, type ScheduleBaseline, type ScheduleBaselineType, type CalendarHoliday } from './state';
import { chooseDirectory, loadDirectory, disconnectDirectory, writeWorkspaceFolder, readWorkspaceFolder, materialMarkdown, type DirectoryHandle } from './directory';
import { activeAiConnection, connectionReady, requestAiProposal, type AiProposal, type ProposalOperation } from './ai';

const SettingsView = defineAsyncComponent(() => import('./SettingsView.vue'));
const route = useRoute();
const router = useRouter();
const mobileNav = ref(false);
const menuButton = ref<HTMLButtonElement>();
const drawerClose = ref<HTMLButtonElement>();
const narrowScreen = window.matchMedia('(max-width: 760px)');
const mobileLayout = ref(narrowScreen.matches);
function resizeNav() { mobileLayout.value = narrowScreen.matches; if (!mobileLayout.value) mobileNav.value = false; }
onMounted(() => narrowScreen.addEventListener('change', resizeNav));
onUnmounted(() => narrowScreen.removeEventListener('change', resizeNav));
async function openNav() { mobileNav.value = true; await nextTick(); drawerClose.value?.focus(); }
async function closeNav() {
  if (!mobileNav.value) return;
  mobileNav.value = false;
  await nextTick();
  menuButton.value?.focus();
}
function cycleDrawer(event: KeyboardEvent) {
  if (!mobileNav.value) return;
  const items = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('a[href], button');
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
watch(() => route.path, closeNav);
const nav = [
  { path: '/planner', icon: 'grid', title: '学习总览' },
  { path: '/planner/today', icon: 'calendar', title: '今日行动' },
  { path: '/planner/schedule', icon: 'calendar', title: '日程安排' },
  { path: '/planner/materials', icon: 'folder', title: '资料与证据' },
  { path: '/planner/reviews', icon: 'chart', title: '阶段回顾' },
  { path: '/planner/ai', icon: 'spark', title: 'AI 规划' },
  { path: '/planner/sync', icon: 'sync', title: '接续与同步' },
];
const isSpaceDetail = computed(() => /^\/planner\/spaces\/[^/]+$/.test(route.path));
const activeSpaceId = computed(() => isSpaceDetail.value ? String(route.params.spaceId || '') : '');
const activeSpace = computed(() => state.spaces.find(space => space.id === activeSpaceId.value));
const pageTitle = computed(() => activeSpace.value?.title || nav.find(n => n.path === route.path)?.title || (route.path === '/settings' ? '设置' : '页面未找到'));
watch(pageTitle, title => { document.title = title + ' · 知序'; }, { immediate: true });
const currentDate = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const spaceName = (id: string) => state.spaces.find(s => s.id === id)?.title || '未分类';
const spaceKindLabel = (kind: SpaceKind) => ({ direction: '方向', plan: '计划', stage: '阶段', project: '项目', branch: '分支' }[kind]);
const spaceStatusLabel = (status: SpaceStatus) => ({ active: '进行中', paused: '暂停', backlog: '搁置', completed: '已完成' }[status]);
const spaceStatuses: Array<{ value: SpaceStatus; label: string }> = [{ value: 'active', label: '进行中' }, { value: 'paused', label: '暂停' }, { value: 'backlog', label: '搁置' }, { value: 'completed', label: '已完成' }];
const proposalKindLabel = (kind: string) => ['direction', 'plan', 'stage', 'project', 'branch'].includes(kind) ? spaceKindLabel(kind as SpaceKind) : '保持原值';
const spaceRoute = (id: string) => `/planner/spaces/${encodeURIComponent(id)}`;
const spaceChildren = (id: string) => state.spaces.filter(space => (space.parentId || '') === id);
const rootSpaces = computed(() => state.spaces.filter(space => !space.parentId));
const activeSpaceChildren = computed(() => activeSpace.value ? spaceChildren(activeSpace.value.id) : []);
const activeSpaceTasks = computed(() => activeSpace.value ? state.tasks.filter(task => task.spaceId === activeSpace.value!.id) : []);
const taskStatusLabel = (status: TaskStatus) => ({ todo: '未开始', in_progress: '进行中', pending_verification: '待验证', done: '已完成', blocked: '阻塞', adjusted: '已调整' }[status]);
const evidenceLevelLabel = (level: EvidenceLevel) => ({ none: '未验证', recorded: '已有一次证据', independent: '可独立完成', stable: '稳定迁移' }[level]);
const actionModeLabel = (mode: ActionMode) => ({ scheduled: '时间安排', deliverable: '成果交付', count: '次数累计', trigger: '触发条件', habit: '习惯循环' }[mode]);
const actionModeHint = (mode: ActionMode) => ({ scheduled: '用日期或时长安排一次具体推进。', deliverable: '以完成一个可查看的成果为准。', count: '以达到次数、题量或样本数为准。', trigger: '在出现特定条件后再执行。', habit: '以可重复的最小行动维持节奏。' }[mode]);
const actionModes: Array<{ value: ActionMode; label: string }> = [{ value: 'scheduled', label: '时间安排' }, { value: 'deliverable', label: '成果交付' }, { value: 'count', label: '次数累计' }, { value: 'trigger', label: '触发条件' }, { value: 'habit', label: '习惯循环' }];
const taskStatuses: Array<{ value: TaskStatus; label: string }> = [{ value: 'todo', label: '未开始' }, { value: 'in_progress', label: '进行中' }, { value: 'pending_verification', label: '待验证' }, { value: 'done', label: '已完成' }, { value: 'blocked', label: '阻塞' }, { value: 'adjusted', label: '已调整' }];
const evidenceLevels: Array<{ value: EvidenceLevel; label: string }> = [{ value: 'none', label: '未验证' }, { value: 'recorded', label: '已有一次证据' }, { value: 'independent', label: '可独立完成' }, { value: 'stable', label: '稳定迁移' }];
const evidenceCounts = computed(() => evidenceLevels.map(level => ({ ...level, count: state.tasks.filter(task => task.evidenceLevel === level.value).length })));
const activeProcessCount = computed(() => state.tasks.filter(task => ['in_progress', 'pending_verification', 'blocked'].includes(task.status)).length);
function setTaskStatus(task: typeof state.tasks[number], status: TaskStatus) { task.status = status; task.done = status === 'done'; }
function toggleTaskMaterial(task: typeof state.tasks[number], materialId: string, checked: boolean) {
  task.materialIds = checked ? [...new Set([...task.materialIds, materialId])] : task.materialIds.filter(id => id !== materialId);
  if (checked && task.evidenceLevel === 'none') task.evidenceLevel = 'recorded';
}
const actionLogsFor = (taskId: string) => state.actionLogs.filter(log => log.taskId === taskId).sort((a, b) => b.date.localeCompare(a.date));
const actionLogDrafts = reactive<Record<string, { note: string; result: string; blocker: string; next: string }>>({});
function actionLogDraft(taskId: string) { return actionLogDrafts[taskId] ||= { note: '', result: '', blocker: '', next: '' }; }
function addActionLog(taskId: string) {
  const task = state.tasks.find(row => row.id === taskId); const draft = actionLogDraft(taskId);
  if (!task || !draft.note.trim()) { tell('先写下这次实际推进了什么。'); return; }
  if (state.actionLogs.length >= 1000) { tell('推进记录已达 1,000 条，请先导出整理。'); return; }
  state.actionLogs.push({ id: uuid(), taskId, date: new Date().toISOString(), note: draft.note.trim(), result: draft.result.trim(), blocker: draft.blocker.trim(), next: draft.next.trim() });
  actionLogDrafts[taskId] = { note: '', result: '', blocker: '', next: '' };
  tell(`已记录“${task.title}”的本次推进。`);
}
watch(() => state.tasks.map(task => `${task.id}:${task.status}`).join('|'), () => {
  state.tasks.forEach(task => { const done = task.status === 'done'; if (task.done !== done) task.done = done; });
}, { flush: 'sync' });
watch(() => state.tasks.map(task => `${task.id}:${task.done}`).join('|'), () => {
  state.tasks.forEach(task => { if (task.done !== (task.status === 'done')) task.status = task.done ? 'done' : 'todo'; });
}, { flush: 'sync' });
const chineseDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || '未排日期';
  const date = new Date(`${value}T12:00:00`);
  const year = Number(match[1]);
  const text = `${Number(match[2])}月${Number(match[3])}日（${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}）`;
  return year === new Date().getFullYear() ? text : `${year}年${text}`;
};

const scheduleDate = ref(day());
const scheduleViewMode = ref<'day' | 'week' | 'month'>('day');
const scheduleEntryDate = ref(day());
const scheduleTitle = ref('');
const scheduleStart = ref('09:00');
const scheduleEnd = ref('10:00');
const scheduleType = ref<ScheduleEntryType>('schedule');
const scheduleCategory = ref<ScheduleCategory>('study');
const scheduleSpace = ref('');
const scheduleTask = ref('');
const scheduleNote = ref('');
const scheduleAllDay = ref(false);
const editingSchedule = ref('');
const scheduleSettingsDraft = reactive({ baselines: [] as ScheduleBaseline[] });
const scheduleBaselineTypes: Array<{ value: ScheduleBaselineType; label: string }> = [
  { value: 'sleep', label: '睡眠' }, { value: 'work', label: '工作' }, { value: 'rest', label: '休息 / 放空' }, { value: 'meal', label: '吃饭' }, { value: 'commute', label: '通勤 / 移动' }, { value: 'custom', label: '自定义' },
];
const scheduleBaselineTypeLabel = (type: ScheduleBaselineType) => scheduleBaselineTypes.find(item => item.value === type)?.label || '自定义';
const scheduleTypes: Array<{ value: ScheduleEntryType; label: string; hint: string }> = [
  { value: 'schedule', label: '普通日程', hint: '一段需要安排时间的活动' },
  { value: 'important', label: '重要日', hint: '里程碑、纪念日或需要特别提醒的日期' },
  { value: 'holiday', label: '节假日', hint: '按官方年度安排手动维护，不把周末自动当作法定节假日' },
];
const scheduleCategories: Array<{ value: ScheduleCategory; label: string }> = [
  { value: 'study', label: '学习 / 研究' }, { value: 'work', label: '工作' }, { value: 'rest', label: '休息' },
  { value: 'personal', label: '个人安排' }, { value: 'appointment', label: '预约 / 外出' }, { value: 'other', label: '其他' },
];
const scheduleTypeLabel = (type: ScheduleEntryType) => ({ schedule: '日程', important: '重要日', holiday: '节假日' }[type]);
const scheduleCategoryLabel = (category: ScheduleCategory) => scheduleCategories.find(item => item.value === category)?.label || '其他';
const clockMinutes = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0; };
const intervalMinutes = (start: string, end: string) => { if (!start || !end) return 0; const diff = clockMinutes(end) - clockMinutes(start); return diff === 0 ? 0 : diff > 0 ? diff : diff + 24 * 60; };

const scheduleEntryMinutes = (entry: ScheduleEntry) => entry.allDay ? 0 : intervalMinutes(entry.start, entry.end);
const scheduleWorkdayFor = (date: string) => {
  // Explicit personal holidays take precedence; makeup workdays override weekends.
  if (state.schedule.some(entry => entry.date === date && entry.type === 'holiday')) return false;
  const holiday = state.scheduleSettings.calendarHolidays.find(row => row.date === date);
  if (holiday?.kind === 'makeup-workday') return true;
  if (holiday?.kind === 'holiday' || holiday?.kind === 'weekend') return false;
  const weekday = new Date(date + 'T12:00:00').getDay();
  return weekday !== 0 && weekday !== 6;
};
const baselineAppliesOn = (baseline: ScheduleBaseline, date: string) => baseline.enabled && (baseline.type !== 'work' || baseline.workdaysOnly === false || scheduleWorkdayFor(date));
const baselineAppliesToday = (baseline: ScheduleBaseline) => baselineAppliesOn(baseline, scheduleDate.value);
const scheduleBaselineMinutes = (baseline: ScheduleBaseline, date = scheduleDate.value) => !baselineAppliesOn(baseline, date) ? 0 : baseline.mode === 'time' ? intervalMinutes(baseline.start, baseline.end) : baseline.minutes;
const baselineOfType = (type: ScheduleBaselineType) => state.scheduleSettings.baselines.find(baseline => baseline.type === type);
const scheduleDayEntries = computed(() => [...state.schedule].filter(entry => entry.date === scheduleDate.value).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title)));
const scheduleDayHolidays = computed(() => scheduleDayEntries.value.filter(entry => entry.type === 'holiday'));
const scheduleDayImportant = computed(() => scheduleDayEntries.value.filter(entry => entry.type === 'important'));
const scheduleDayMinutes = computed(() => scheduleDayEntries.value.reduce((sum, entry) => sum + scheduleEntryMinutes(entry), 0));
const sleepMinutes = computed(() => { const baseline = baselineOfType('sleep'); return baseline ? scheduleBaselineMinutes(baseline) : intervalMinutes(state.scheduleSettings.sleepStart, state.scheduleSettings.sleepEnd); });
const workMinutes = computed(() => { const baseline = baselineOfType('work'); return baseline ? scheduleBaselineMinutes(baseline) : intervalMinutes(state.scheduleSettings.workStart, state.scheduleSettings.workEnd); });
const routineMinutes = computed(() => state.scheduleSettings.baselines.reduce((sum, baseline) => sum + scheduleBaselineMinutes(baseline), 0));
const allocatedMinutes = computed(() => routineMinutes.value + scheduleDayMinutes.value);
const freeMinutes = computed(() => Math.max(0, 24 * 60 - allocatedMinutes.value));
const overbookedMinutes = computed(() => Math.max(0, allocatedMinutes.value - 24 * 60));
const budgetUsedPercent = computed(() => Math.min(100, Math.round(allocatedMinutes.value / (24 * 60) * 100)));
const scheduleDateLabel = computed(() => chineseDate(scheduleDate.value));
const scheduleIsToday = computed(() => scheduleDate.value === day());
const scheduleViewLabel = computed(() => scheduleViewMode.value === 'month' ? scheduleMonthLabel.value : scheduleViewMode.value === 'week' ? `本周 · ${scheduleDateLabel.value}` : scheduleDateLabel.value);
const scheduleHeadingTitle = computed(() => scheduleViewMode.value === 'month' ? '把整月安排，看成一张图。' : scheduleViewMode.value === 'week' ? '先看分布，再决定怎么安排。' : '把一天的时间，看清楚。');
const scheduleWeekDates = computed(() => {
  const current = new Date(`${scheduleDate.value}T12:00:00`);
  const mondayOffset = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(current); date.setDate(current.getDate() + index);
    return date.toLocaleDateString('sv-SE');
  });
});
const scheduleWeekday = (value: string) => ['日', '一', '二', '三', '四', '五', '六'][new Date(`${value}T12:00:00`).getDay()];
const isWeekend = (value: string) => [0, 6].includes(new Date(`${value}T12:00:00`).getDay());
const scheduleCountFor = (value: string) => state.schedule.filter(entry => entry.date === value).length;
const isoDate = (value: Date) => value.toLocaleDateString('sv-SE');
const scheduleMonthKey = computed(() => scheduleDate.value.slice(0, 7));
const scheduleMonthLabel = computed(() => new Date(`${scheduleMonthKey.value}-01T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }));
const scheduleEntryMap = computed(() => {
  const map = new Map<string, ScheduleEntry[]>();
  state.schedule.forEach(entry => map.set(entry.date, [...(map.get(entry.date) || []), entry]));
  return map;
});
const scheduleEntriesFor = (value: string) => [...(scheduleEntryMap.value.get(value) || [])].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
const scheduleWeekEntries = computed(() => state.schedule.filter(entry => scheduleWeekDates.value.includes(entry.date)));
const scheduleWeekMinutes = computed(() => scheduleWeekEntries.value.reduce((sum, entry) => sum + scheduleEntryMinutes(entry), 0));
const scheduleWeekHolidays = computed(() => scheduleWeekEntries.value.filter(entry => entry.type === 'holiday'));
const scheduleWeekImportant = computed(() => scheduleWeekEntries.value.filter(entry => entry.type === 'important'));
const scheduleWeekDaysWithEntries = computed(() => new Set(scheduleWeekEntries.value.map(entry => entry.date)).size);
const scheduleWeekGridDays = computed(() => scheduleWeekDates.value.map(date => ({ date, entries: scheduleEntriesFor(date) })));
const scheduleMonthGridDates = computed(() => {
  const first = new Date(`${scheduleMonthKey.value}-01T12:00:00`);
  const offset = (first.getDay() + 6) % 7;
  const last = new Date(first); last.setMonth(last.getMonth() + 1, 0);
  const cellCount = Math.ceil((offset + last.getDate()) / 7) * 7;
  const start = new Date(first); start.setDate(1 - offset);
  return Array.from({ length: cellCount }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return isoDate(date); });
});
const scheduleMonthEntries = computed(() => state.schedule.filter(entry => entry.date.startsWith(`${scheduleMonthKey.value}-`)));
const scheduleMonthMinutes = computed(() => scheduleMonthEntries.value.reduce((sum, entry) => sum + scheduleEntryMinutes(entry), 0));
const budgetNow = ref(new Date());
const budgetClock = setInterval(() => { budgetNow.value = new Date(); }, 60_000);
onUnmounted(() => clearInterval(budgetClock));
const remainingIntervalMinutes = (start: string, end: string, from: number) => {
  if (!start || !end || start === end) return 0;
  const a = clockMinutes(start), b = clockMinutes(end);
  const overlap = (left: number, right: number) => Math.max(0, right - Math.max(left, from));
  return b > a ? overlap(a, b) : overlap(a, 1440) + overlap(0, b);
};
const scheduleBudgetForDates = (dates: string[]) => {
  const today = isoDate(budgetNow.value);
  const fromNow = dates.includes(today);
  const availableDates = dates.filter(date => date >= today);
  let baseline = 0, free = 0, over = 0, overDays = 0;
  for (const date of availableDates) {
    const from = date === today ? budgetNow.value.getHours() * 60 + budgetNow.value.getMinutes() : 0;
    const routine = state.scheduleSettings.baselines.reduce((sum, row) => sum + (!baselineAppliesOn(row, date) ? 0 : row.mode === 'time' ? remainingIntervalMinutes(row.start, row.end, from) : row.minutes), 0);
    const extra = (scheduleEntryMap.value.get(date) || []).reduce((sum, entry) => sum + (entry.allDay ? 0 : remainingIntervalMinutes(entry.start, entry.end, from)), 0);
    const remaining = 1440 - from - routine - extra;
    baseline += routine;
    free += Math.max(0, remaining);
    over += Math.max(0, -remaining);
    if (remaining < 0) overDays++;
  }
  return { days: dates.length, baseline, free, over, overDays, fromNow, past: availableDates.length === 0 };
};
const scheduleMonthBudget = computed(() => scheduleBudgetForDates(scheduleMonthGridDates.value.filter(date => date.startsWith(scheduleMonthKey.value + '-'))));
const scheduleWeekBudget = computed(() => scheduleBudgetForDates(scheduleWeekDates.value));
const scheduleMonthDaysWithEntries = computed(() => new Set(scheduleMonthEntries.value.map(entry => entry.date)).size);
const scheduleMonthHolidays = computed(() => scheduleMonthEntries.value.filter(entry => entry.type === 'holiday'));
const scheduleMonthImportant = computed(() => scheduleMonthEntries.value.filter(entry => entry.type === 'important'));
const scheduleMonthApiHolidays = computed(() => state.scheduleSettings.calendarHolidays.filter(holiday => holiday.date.startsWith(`${scheduleMonthKey.value}-`) && holiday.kind === 'holiday'));
const scheduleMonthApiMakeupWorkdays = computed(() => state.scheduleSettings.calendarHolidays.filter(holiday => holiday.date.startsWith(`${scheduleMonthKey.value}-`) && holiday.kind === 'makeup-workday'));
const scheduleMonthHolidayCount = computed(() => new Set([...scheduleMonthHolidays.value.map(entry => entry.date), ...scheduleMonthApiHolidays.value.map(holiday => holiday.date)]).size);
const calendarHolidayFor = (value: string) => state.scheduleSettings.calendarHolidays.find(holiday => holiday.date === value);
const holidayLabelFor = (value: string) => calendarHolidayFor(value)?.name || (state.schedule.some(entry => entry.date === value && entry.type === 'holiday') ? '自定义节假日' : '');
const makeupWorkdayFor = (value: string) => calendarHolidayFor(value)?.kind === 'makeup-workday';
const hasHolidayFor = (value: string) => state.schedule.some(entry => entry.date === value && entry.type === 'holiday') || calendarHolidayFor(value)?.kind === 'holiday';
const scheduleHolidayLastSync = computed(() => state.scheduleSettings.calendarHolidays.filter(holiday => holiday.source === 'timor.tech' && holiday.date.startsWith(scheduleMonthKey.value.slice(0, 4) + '-')).map(holiday => holiday.updatedAt).sort().at(-1) || '');
const scheduleHolidaySyncing = ref(false);
const scheduleHolidayError = ref('');
const scheduleHolidaySyncLabel = computed(() => scheduleHolidayLastSync.value ? `${scheduleMonthKey.value.slice(0, 4)} 年已同步 · ${new Date(scheduleHolidayLastSync.value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : `${scheduleMonthKey.value.slice(0, 4)} 年假期尚未同步`);
const scheduleBaselineRows = computed(() => state.scheduleSettings.baselines.map(row => ({ label: row.title, detail: row.enabled && !baselineAppliesToday(row) ? '休息日 · 当天不计入' : row.enabled ? `${scheduleBaselineTypeLabel(row.type)} · ${row.mode === 'time' ? '按时间段' : '按分钟预算'}` : '已停用', value: !baselineAppliesToday(row) ? '不占用时间' : row.mode === 'time' ? `${row.start} — ${row.end}` : `${row.minutes} 分钟` })));
const scheduleBaselineDraftRows = computed(() => scheduleSettingsDraft.baselines);
const shiftScheduleDate = (amount: number) => { const current = new Date(`${scheduleDate.value}T12:00:00`); current.setDate(current.getDate() + amount); scheduleDate.value = isoDate(current); };
const shiftSchedulePeriod = (amount: number) => {
  if (scheduleViewMode.value === 'month') { const current = new Date(`${scheduleMonthKey.value}-01T12:00:00`); current.setMonth(current.getMonth() + amount); scheduleDate.value = isoDate(current); return; }
  shiftScheduleDate(scheduleViewMode.value === 'week' ? amount * 7 : amount);
};
const selectScheduleDate = (value: string) => { scheduleDate.value = value; };
const selectCalendarDate = (value: string) => { scheduleDate.value = value; scheduleViewMode.value = 'day'; };
const goScheduleToday = () => { scheduleDate.value = day(); };
function openScheduleSettings() {
  scheduleSettingsDraft.baselines = state.scheduleSettings.baselines.map(row => ({ ...row, workdaysOnly: row.workdaysOnly !== false }));
  openModal('scheduleSettings');
}
function addScheduleBaseline() { scheduleSettingsDraft.baselines.push({ id: uuid(), title: '新的时间安排', type: 'custom', mode: 'minutes', start: '', end: '', minutes: 30, enabled: true }); }
function removeScheduleBaseline(id: string) { const index = scheduleSettingsDraft.baselines.findIndex(row => row.id === id); if (index >= 0) scheduleSettingsDraft.baselines.splice(index, 1); }
function saveScheduleSettings() {
  const minutes = (value: number) => Math.max(0, Math.min(1440, Math.round(Number(value) || 0)));
  if (!scheduleSettingsDraft.baselines.length) { error.value = '至少保留一项时间安排；不需要的项目可以停用。'; return; }
  const rows = scheduleSettingsDraft.baselines.map(row => ({ ...row, title: row.title.trim(), minutes: minutes(row.minutes) }));
  if (rows.some(row => !row.title)) { error.value = '请给每个时间安排填写名称。'; return; }
  if (rows.some(row => row.mode === 'time' && (!row.start || !row.end || row.start === row.end))) { error.value = '按时间段计算的安排，需要填写不同的开始和结束时间。'; return; }
  const legacy = (type: ScheduleBaselineType, fallback: ScheduleBaseline) => rows.find(row => row.type === type) || fallback;
  const sleep = legacy('sleep', rows[0]!); const work = legacy('work', rows[0]!);
  const rest = legacy('rest', rows[0]!); const meal = legacy('meal', rows[0]!); const commute = legacy('commute', rows[0]!);
  Object.assign(state.scheduleSettings, { baselines: rows, sleepStart: sleep.start, sleepEnd: sleep.end, workStart: work.start, workEnd: work.end, restMinutes: rest.minutes, mealMinutes: meal.minutes, commuteMinutes: commute.minutes });
  closeModal(); tell('生活基线已更新，今日可用时间已重新计算。');
}
async function syncScheduleHolidays(year = Number(scheduleMonthKey.value.slice(0, 4))) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return;
  scheduleHolidaySyncing.value = true; scheduleHolidayError.value = '';
  try {
    const response = await fetch(`https://timor.tech/api/holiday/year/${year}?type=Y&week=Y`);
    if (!response.ok) throw new Error(`接口返回 ${response.status}`);
    const payload = await response.json() as { holiday?: Record<string, { holiday?: boolean; name?: string }>; type?: Record<string, { type?: number; name?: string }> };
    const holidayMap = payload.holiday || {}; const typeMap = payload.type || {};
    const keys = new Set([...Object.keys(holidayMap), ...Object.keys(typeMap)]);
    const dates = new Set<string>();
    const updatedAt = new Date().toISOString();
    const rows: CalendarHoliday[] = [];
    keys.forEach(key => {
      const date = key.length === 5 ? `${year}-${key}` : key;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (dates.has(date)) return;
      dates.add(date);
      const shortDate = date.slice(5); const holiday = holidayMap[shortDate] || holidayMap[date] || {}; const type = typeMap[date] || typeMap[shortDate] || {};
      const kind: CalendarHoliday['kind'] | undefined = type.type === 3 ? 'makeup-workday' : type.type === 2 || holiday.holiday ? 'holiday' : type.type === 1 ? 'weekend' : undefined;
      if (!kind) return;
      rows.push({ date, name: kind === 'makeup-workday' ? type.name || holiday.name || '补班' : kind === 'holiday' ? holiday.name || type.name || '节假日' : type.name || '周末', kind, source: 'timor.tech', updatedAt });
    });
    const kept = state.scheduleSettings.calendarHolidays.filter(row => !(row.source === 'timor.tech' && row.date.startsWith(`${year}-`)));
    state.scheduleSettings.calendarHolidays = [...kept, ...rows].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
    tell(`${year} 年节假日与补班信息已同步并保存到浏览器工作区。`);
  } catch (cause) {
    scheduleHolidayError.value = cause instanceof Error ? cause.message : '网络请求失败';
  } finally { scheduleHolidaySyncing.value = false; }
}
const scheduleTaskOptions = computed(() => [...state.tasks].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)));
function newSchedule(date = scheduleDate.value) {
  editingSchedule.value = ''; scheduleTitle.value = ''; scheduleEntryDate.value = date; scheduleStart.value = '09:00'; scheduleEnd.value = '10:00'; scheduleType.value = 'schedule'; scheduleCategory.value = 'study'; scheduleSpace.value = ''; scheduleTask.value = ''; scheduleNote.value = ''; scheduleAllDay.value = false;
  openModal('schedule');
}
function newSpecialSchedule(type: ScheduleEntryType) {
  newSchedule(scheduleDate.value); scheduleType.value = type; scheduleAllDay.value = type === 'holiday';
}
function editSchedule(id: string) {
  const entry = state.schedule.find(item => item.id === id); if (!entry) return;
  editingSchedule.value = entry.id; scheduleTitle.value = entry.title; scheduleEntryDate.value = entry.date; scheduleStart.value = entry.start || '09:00'; scheduleEnd.value = entry.end || '10:00'; scheduleType.value = entry.type; scheduleCategory.value = entry.category; scheduleSpace.value = entry.spaceId; scheduleTask.value = entry.taskId; scheduleNote.value = entry.note; scheduleAllDay.value = entry.allDay; openModal('schedule');
}
function saveSchedule() {
  if (!scheduleTitle.value.trim() || !scheduleEntryDate.value) { error.value = '请填写日程名称和日期。'; return; }
  const allDay = scheduleType.value === 'holiday' || scheduleAllDay.value;
  if (!allDay && clockMinutes(scheduleEnd.value) <= clockMinutes(scheduleStart.value)) { error.value = '结束时间需要晚于开始时间；跨午夜的安排请拆成两条日程。'; return; }
  const linkedTask = state.tasks.find(task => task.id === scheduleTask.value);
  if (scheduleTask.value && !linkedTask) { error.value = '关联行动已不存在，请重新选择。'; return; }
  if (linkedTask && scheduleSpace.value && scheduleSpace.value !== linkedTask.spaceId) { error.value = '关联行动所属方向与当前方向不一致，请统一选择。'; return; }
  if (state.schedule.length >= 1000 && !editingSchedule.value) { error.value = '日程已达 1,000 条，请先整理或导出。'; return; }
  const record = { id: editingSchedule.value || uuid(), title: scheduleTitle.value.trim(), date: scheduleEntryDate.value, start: allDay ? '' : scheduleStart.value, end: allDay ? '' : scheduleEnd.value, type: scheduleType.value, category: scheduleCategory.value, note: scheduleNote.value.trim(), spaceId: linkedTask?.spaceId || scheduleSpace.value, taskId: linkedTask?.id || '', allDay };
  const existing = state.schedule.find(entry => entry.id === editingSchedule.value);
  if (existing) Object.assign(existing, record); else state.schedule.push(record);
  scheduleDate.value = scheduleEntryDate.value; closeModal(); tell(existing ? '日程已更新。' : scheduleTypeLabel(record.type) + '已加入日程。');
}
async function deleteSchedule(id: string) {
  const entry = state.schedule.find(item => item.id === id); if (!entry || !await askDelete(`删除“${entry.title}”？`)) return;
  const previousId = history.value[0]?.id;
  state.schedule.splice(state.schedule.findIndex(item => item.id === id), 1); closeModal(); deleted('日程已删除。', previousId);
}

const spaceAncestors = (id: string) => {
  const result: typeof state.spaces = []; const seen = new Set<string>(); let current = state.spaces.find(space => space.id === id);
  while (current?.parentId && !seen.has(current.parentId)) { seen.add(current.parentId); const parent = state.spaces.find(space => space.id === current!.parentId); if (!parent) break; result.unshift(parent); current = parent; }
  return result;
};
const descendants = (id: string): string[] => id ? state.spaces.filter(space => (space.parentId || '') === id).flatMap(space => [space.id, ...descendants(space.id)]) : [];
const spaceTaskIds = (id: string) => new Set([id, ...descendants(id)]);
const spaceTreeRows = computed(() => {
  const rows: Array<{ space: typeof state.spaces[number]; depth: number }> = [];
  const included = new Set<string>();
  const visit = (parentId: string, depth: number) => state.spaces.filter(space => (space.parentId || '') === parentId).forEach(space => { rows.push({ space, depth }); visit(space.id, depth + 1); });
  visit('', 0); rows.forEach(row => included.add(row.space.id));
  state.spaces.filter(space => !included.has(space.id)).forEach(space => rows.push({ space, depth: 0 }));
  return rows;
});

const directionOptions = computed(() => spaceTreeRows.value.map(row => ({ value: row.space.id, label: row.space.title, depth: row.depth, description: spaceAncestors(row.space.id).map(s => s.title).join(' / ') || '大方向' })));
const queueDate = computed(() => isoDate(budgetNow.value));
const actionGroups = computed(() => {
  const groups: Record<'today' | 'unscheduled' | 'future' | 'completed', Workspace['tasks']> = { today: [], unscheduled: [], future: [], completed: [] };
  for (const task of state.tasks) {
    const group = task.done ? 'completed' : !task.date ? 'unscheduled' : task.date > queueDate.value ? 'future' : 'today';
    groups[group].push(task);
  }
  groups.future.sort((a, b) => a.date.localeCompare(b.date));
  return groups;
});
const pendingDailyCount = computed(() => actionGroups.value.today.length + actionGroups.value.unscheduled.length);
const parentOptions = computed(() => [{ value: '', label: '作为大方向', description: '不属于其他方向' }, ...directionOptions.value.filter(o => o.value !== editingSpace.value && !descendants(editingSpace.value).includes(o.value))]);
const progressMap = computed(() => calculateProgress(state));
const progress = (id: string) => progressMap.value.get(id) || { total: 0, done: 0, percent: 0, raw: 0, rawPercent: 0, direct: null, children: null, directPercent: null, childPercent: null };
const siblingWeightTotal = (space: typeof state.spaces[number]) => {
  const siblings = space.parentId ? spaceChildren(space.parentId) : rootSpaces.value;
  return siblings.reduce((sum, row) => sum + row.weight, 0);
};
const normalizedWeight = (space: typeof state.spaces[number]) => {
  const total = siblingWeightTotal(space);
  return total ? space.weight / total * 100 : 0;
};
const directActionWeightTotal = (id: string) => state.tasks.filter(task => task.spaceId === id).reduce((sum, task) => sum + actionImpact(task), 0);
const directActionShare = (task: typeof state.tasks[number]) => {
  const total = directActionWeightTotal(task.spaceId);
  return total ? actionImpact(task) / total * 100 : 0;
};
const copyWorkspace = () => JSON.parse(JSON.stringify(state)) as Workspace;
const confirmation = ref<InstanceType<typeof DeleteConfirmation>>();
const askDelete = (message: string) => confirmation.value!.ask(message);
const undoId = ref('');
async function deleted(message: string, previousId?: string) {
  tell(message);
  await nextTick();
  const latest = history.value[0]?.id;
  if (latest && latest !== previousId) undoId.value = latest;
}
function undoDeletion() {
  try { undoAdjustment(undoId.value); tell('已撤销删除。'); }
  catch (cause) { tell(cause instanceof Error ? cause.message : '撤销失败。'); }
}
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout>;
function tell(message: string) { undoId.value = ''; toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 5000); }

const dialog = ref<HTMLDialogElement>();
const modal = ref('');
const error = ref('');
const dialogTitle = computed(() => ({ starter: '创建起步计划', task: editingTask.value ? '调整这个行动' : '安排一个小行动', space: editingSpace.value ? '调整方向' : spaceParentId.value ? '新建子方向' : '新建大方向', material: editingMaterial.value ? '调整资料记录' : '记录一份学习自述', draftEdit: '调整想法草稿', reviewEdit: '调整阶段回顾', schedule: editingSchedule.value ? '调整日程' : '添加日程', scheduleSettings: '管理生活基线', import: '确认读取目录工作区', reset: '恢复示例工作区', clear: '清空浏览器工作区', context: '带着上下文，继续讨论' }[modal.value] || ''));
async function openModal(name: string) { modal.value = name; error.value = ''; await nextTick(); dialog.value?.showModal(); }
function closeModal() { dialog.value?.close(); modal.value = ''; error.value = ''; }
const taskTitle = ref('');
const editingTask = ref('');
const taskSpace = ref('');
const taskMinutes = ref<number | null>(null);
const taskDate = ref('');
const taskSummary = ref('');
const taskWeight = ref(1);
const taskDifficulty = ref(1);
const taskStatus = ref<TaskStatus>('todo');
const taskEvidenceLevel = ref<EvidenceLevel>('none');
const taskActionMode = ref<ActionMode>('deliverable');
const taskTarget = ref('');
const taskPlanningOpen = ref(false);
const taskSummaryInput = ref<HTMLInputElement>();
const applyingDraft = ref<Draft>();
function newTask(spaceId?: string, draft?: Draft) {
  editingTask.value = '';
  if (!state.spaces.length) { tell('先创建一个学习方向，再添加行动。'); newSpace(); return; }
  taskTitle.value = draft?.text.slice(0, 200) || ''; taskSpace.value = spaceId || draft?.spaceId || rootSpaces.value[0]?.id || state.spaces[0]!.id;
  taskMinutes.value = null; taskDate.value = ''; taskSummary.value = ''; taskWeight.value = 1; taskDifficulty.value = 1; taskStatus.value = 'todo'; taskEvidenceLevel.value = 'none'; taskActionMode.value = 'deliverable'; taskTarget.value = ''; taskPlanningOpen.value = false; applyingDraft.value = draft;
  openModal('task');
}
function editTask(id: string) {
  const task = state.tasks.find(t => t.id === id); if (!task) return;
  editingTask.value = id; taskTitle.value = task.title; taskSpace.value = task.spaceId;
  taskMinutes.value = task.minutes || null; taskDate.value = task.date; taskSummary.value = task.summary || ''; taskWeight.value = task.weight; taskDifficulty.value = task.difficulty; taskStatus.value = task.status; taskEvidenceLevel.value = task.evidenceLevel; taskActionMode.value = task.actionMode; taskTarget.value = task.target; taskPlanningOpen.value = true; applyingDraft.value = undefined;
  openModal('task');
}
async function importTaskSummary(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0];
  if (!file) return;
  try { if (file.size > 2 * 1024 * 1024) throw new Error('行动总结文件请控制在 2 MB 内。'); taskSummary.value = (await file.text()).slice(0, 12000); tell(`已载入总结文件：${file.name}`); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '总结文件读取失败。'; }
  finally { input.value = ''; }
}
function addTask() {
  if (!editingTask.value && state.tasks.length >= 500) { error.value = '原型最多保留 500 个行动，请先导出整理。'; return; }
  if (!taskTitle.value.trim() || !state.spaces.some(s => s.id === taskSpace.value)) { error.value = '请填写行动标题并选择学习方向。'; return; }
  const values = { spaceId: taskSpace.value, title: taskTitle.value.trim(), summary: taskSummary.value.trim(), actionMode: taskActionMode.value, target: taskTarget.value.trim(), minutes: Number(taskMinutes.value || 0), date: taskDate.value, weight: Number(taskWeight.value), difficulty: Number(taskDifficulty.value), status: taskStatus.value, evidenceLevel: taskEvidenceLevel.value, materialIds: state.tasks.find(task => task.id === editingTask.value)?.materialIds || [], done: taskStatus.value === 'done' };
  try {
    const next = copyWorkspace();
    const existing = next.tasks.find(t => t.id === editingTask.value);
    if (existing) Object.assign(existing, values);
    else next.tasks.push({ id: uuid(), ...values });
    next.schedule.forEach(entry => { const task = next.tasks.find(row => row.id === entry.taskId); if (task) entry.spaceId = task.spaceId; });
    const draft = next.drafts.find(row => row.id === applyingDraft.value?.id); if (draft) draft.applied = true;
    replaceWorkspace(validateWorkspace(next), editingTask.value ? '编辑行动' : '新建行动');
    closeModal(); tell(existing ? '行动安排已更新。' : '行动已加入计划。');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '行动未能保存，请检查字段。'; }
}
async function deleteTask(id: string) {
  const task = state.tasks.find(t => t.id === id); if (!task || !await askDelete(`删除行动“${task.title}”？`)) return;
  const previousId = history.value[0]?.id;
  state.tasks.splice(state.tasks.findIndex(t => t.id === id), 1); closeModal(); deleted('行动已删除。', previousId);
  state.actionLogs.splice(0, state.actionLogs.length, ...state.actionLogs.filter(log => log.taskId !== id));
  state.schedule.splice(0, state.schedule.length, ...state.schedule.filter(entry => entry.taskId !== id));
}
const editingSpace = ref('');
const spaceTitle = ref('');
const spaceParentId = ref('');
const spaceKind = ref<SpaceKind>('direction');
const spaceStatus = ref<SpaceStatus>('active');
const spaceCategory = ref('长期方向');
const spaceDescription = ref('');
const spaceMilestone = ref('');
const spaceDefinitionOfDone = ref('');
const spaceColor = ref('sage');
const spaceWeight = ref(1);
const spaceDifficulty = ref(1);
const spacePlanningOpen = ref(true);
// Draft calculations use copies only; neither storage nor completion facts change.
const manualPreview = computed(() => {
  if (modal.value !== 'space' && modal.value !== 'task') return {};
  try {
    const next = copyWorkspace();
    const id = previewIdFactory(state)();
    if (modal.value === 'space') {
      const values = { parentId: spaceParentId.value, kind: spaceKind.value, weight: Number(spaceWeight.value), difficulty: Number(spaceDifficulty.value) };
      const existing = next.spaces.find(row => row.id === editingSpace.value);
      if (existing) Object.assign(existing, values);
      else next.spaces.push({ id, title: spaceTitle.value.trim() || '新节点', status: 'active', category: '阶段学习', description: '', milestone: '', definitionOfDone: '', color: 'sage', icon: 'target', ...values });
    } else {
      const values = { spaceId: taskSpace.value, weight: Number(taskWeight.value), difficulty: Number(taskDifficulty.value), status: taskStatus.value, done: taskStatus.value === 'done' };
      const existing = next.tasks.find(row => row.id === editingTask.value);
      if (existing) Object.assign(existing, values);
      else next.tasks.push({ id, title: taskTitle.value.trim() || '新行动', summary: '', minutes: 0, date: '', evidenceLevel: 'none', materialIds: [], actionMode: 'deliverable', target: '', ...values });
    }
    next.schedule.forEach(entry => { const task = next.tasks.find(row => row.id === entry.taskId); if (task) entry.spaceId = task.spaceId; });
    return { after: validateWorkspace(next) };
  } catch { return { error: '请检查节点归属、分量（1–100）和难度（1–5）。' }; }
});

function newSpace(id?: string, parentId = '') {
  const existing = state.spaces.find(s => s.id === id);
  editingSpace.value = existing?.id || ''; spaceParentId.value = existing?.parentId || parentId; spaceKind.value = existing?.kind || (parentId ? 'plan' : 'direction'); spaceStatus.value = existing?.status || 'active'; spaceTitle.value = existing?.title || ''; spaceCategory.value = existing?.category || (parentId ? '阶段学习' : '长期方向');
  spaceDescription.value = existing?.description || ''; spaceMilestone.value = existing?.milestone || ''; spaceDefinitionOfDone.value = existing?.definitionOfDone || ''; spaceColor.value = existing?.color || 'sage'; spaceWeight.value = existing?.weight || 1; spaceDifficulty.value = existing?.difficulty || 1; spacePlanningOpen.value = Boolean(existing); openModal('space');
}
function saveSpace() {
  if (!spaceTitle.value.trim()) return;
  if (editingSpace.value && (spaceParentId.value === editingSpace.value || (spaceParentId.value && descendants(editingSpace.value).includes(spaceParentId.value)))) { error.value = '不能把一个方向放到自己或自己的下级里面。'; return; }
  const values = { parentId: spaceParentId.value, kind: spaceKind.value, status: spaceStatus.value, title: spaceTitle.value.trim(), category: spaceCategory.value, description: spaceDescription.value.trim(), milestone: spaceMilestone.value.trim(), definitionOfDone: spaceDefinitionOfDone.value.trim(), color: spaceColor.value, weight: Number(spaceWeight.value), difficulty: Number(spaceDifficulty.value) };
  try {
    const next = copyWorkspace();
    const existing = next.spaces.find(s => s.id === editingSpace.value);
    if (existing) Object.assign(existing, values);
    else if (next.spaces.length < 200) next.spaces.push({ id: uuid(), icon: 'target', ...values });
    else { error.value = '原型最多支持 200 个规划节点。'; return; }
    replaceWorkspace(validateWorkspace(next), '保存方向');
    closeModal(); tell('学习方向已保存。');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '节点未能保存，请检查字段。'; }
}
async function deleteSpace(id: string) {
  const space = state.spaces.find(s => s.id === id); if (!space) return;
  const ids = new Set([id, ...descendants(id)]); const deletedTaskIds = new Set(state.tasks.filter(t => ids.has(t.spaceId)).map(task => task.id)); const linked = deletedTaskIds.size;
  if (!await askDelete(`删除“${space.title}”及其 ${ids.size - 1} 个下级节点、${linked} 个关联行动？`)) return;
  const previousId = history.value[0]?.id;
  state.tasks.splice(0, state.tasks.length, ...state.tasks.filter(t => !ids.has(t.spaceId)));
  state.actionLogs.splice(0, state.actionLogs.length, ...state.actionLogs.filter(log => state.tasks.some(task => task.id === log.taskId)));
  state.schedule.splice(0, state.schedule.length, ...state.schedule.filter(entry => !ids.has(entry.spaceId) && !deletedTaskIds.has(entry.taskId)));
  state.spaces.splice(0, state.spaces.length, ...state.spaces.filter(value => !ids.has(value.id)));
  for (const material of state.materials) { if (material.referenceIds) material.referenceIds = material.referenceIds.filter(ref => !ids.has(ref)); }
  for (const row of [...state.drafts, ...state.materials, ...state.reviews]) if (row.spaceId && ids.has(row.spaceId)) row.spaceId = '';
  closeModal(); deleted('规划节点及其关联行动已删除。', previousId);
}
const draftText = ref('');
function saveDraft() {
  if (!draftText.value.trim()) return;
  if (state.drafts.length >= 50) { tell('草稿已达 50 条，请先整理。'); return; }
  state.drafts.push({ id: uuid(), text: draftText.value.trim(), date: new Date().toISOString(), applied: false });
  draftText.value = ''; tell('想法已保存。可在确认后转为具体行动。');
}
const recentDrafts = computed(() => [...state.drafts].reverse().slice(0, 4));
const editingDraft = ref('');
const draftEditText = ref('');
const draftEditSpace = ref('');
function editDraft(id: string) { const value = state.drafts.find(d => d.id === id); if (!value) return; editingDraft.value = id; draftEditText.value = value.text; draftEditSpace.value = value.spaceId || ''; openModal('draftEdit'); }
function saveDraftEdit() { const value = state.drafts.find(d => d.id === editingDraft.value); if (!value || !draftEditText.value.trim()) return; value.text = draftEditText.value.trim(); value.spaceId = draftEditSpace.value; closeModal(); tell('草稿已更新。'); }
async function deleteDraft(id: string) { const index = state.drafts.findIndex(d => d.id === id); if (index < 0 || !await askDelete('删除这条想法草稿？')) return; const previousId = history.value[0]?.id; state.drafts.splice(index, 1); deleted('草稿已删除。', previousId); }
const materialTitle = ref('');
const materialText = ref('');
const materialKind = ref('自述');
const materialSpace = ref('');
const materialReferences = ref<string[]>([]);
const materialLibrary = ref('*');
const materialSearch = ref('');
const importOwner = ref('');
const autoGuide = ref(true);
const guideBusy = reactive(new Set<string>());
const guideErrors = reactive<Record<string, string>>({});
const uploadTarget = computed(() => materialLibrary.value === '*' ? importOwner.value : materialLibrary.value);
const questionGlobal = ref(false);
const questionMaterials = computed(() => {
  const scope = materialLibrary.value;
  if (scope === '*') return state.materials;
  if (!scope) return state.materials.filter(m => !m.spaceId);
  if (!state.spaces.some(s => s.id === scope)) return [];
  return eligibleMaterials(scope, questionGlobal.value, materialIncludeChildren.value);
});
async function analyzeRecord(id: string) {
  if (guideBusy.has(id)) return;
  guideBusy.add(id); delete guideErrors[id];
  try { await generateGuide(id); }
  catch (e) { guideErrors[id] = e instanceof Error ? e.message : '生成失败，请重试。'; }
  finally { guideBusy.delete(id); }
}
async function saveGuide(id: string) {
  await analyzeRecord(id);
  if (directory.value && state.materials.find(m => m.id === id)?.guide) await saveMaterialsLocally();
}
async function downloadOriginal(material: Material) {
  try {
    const file = material.sourceHash && await getOriginal(material.sourceHash);
    if (!file) throw new Error('此浏览器缺少原件，可从已同步的工作区目录重新读取。');
    const url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = material.sourceName || material.name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { tell(e instanceof Error ? e.message : '读取原件失败。'); }
}
const materialIncludeChildren = ref(true);
const materialSaveLocal = ref(true);
const materialLocalStatus = ref('');
const materialLocalError = ref(false);
const materialLibraryOptions = computed(() => [{ value: '*', label: '全部资料', description: '查看所有资料库' }, { value: '', label: '总文件库', description: '通用资料，可在 AI 中选择引用' }, ...directionOptions.value]);
const materialOwnerOptions = computed(() => materialLibraryOptions.value.filter(o => o.value !== '*'));
const libraryMaterials = computed(() => {
  const ids = new Set([materialLibrary.value, ...(materialIncludeChildren.value ? descendants(materialLibrary.value) : [])]);
  return [...state.materials].reverse().filter(m => materialLibrary.value === '*' || ids.has(m.spaceId || '') || m.referenceIds?.some(id => ids.has(id)));
});
const filteredMaterials = computed(() => {
  const q = materialSearch.value.trim().toLocaleLowerCase();
  return q ? libraryMaterials.value.filter(m => `${m.name} ${m.guide?.summary || ''} ${m.excerpt}`.toLocaleLowerCase().includes(q)) : libraryMaterials.value;
});
type LibraryTool = 'import' | 'questions';
const selectedLibraryTool = ref<LibraryTool | 'auto' | 'closed'>('auto');
const visibleLibraryTool = computed(() => selectedLibraryTool.value === 'auto'
  ? (libraryMaterials.value.length ? 'closed' : 'import') : selectedLibraryTool.value);
function toggleLibraryTool(tool: LibraryTool) {
  selectedLibraryTool.value = visibleLibraryTool.value === tool ? 'closed' : tool;
}
watch([materialLibrary, () => route.path], () => { selectedLibraryTool.value = 'auto'; });
watch(() => route.query.library, value => { if (route.path === '/planner/materials') materialLibrary.value = typeof value === 'string' && state.spaces.some(s => s.id === value) ? value : '*'; }, { immediate: true });
const materialLibraryName = (id?: string) => id ? [...spaceAncestors(id).map(s => s.title), spaceName(id)].join(' / ') : '总文件库';
function downloadMaterial(material: Material) {
  const filename = material.name.replace(/\.(md|txt|csv)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 120) || '学习笔记';
  downloadFile(`${filename}.md`, materialMarkdown(material), 'text/markdown;charset=utf-8');
}
async function saveMaterialsLocally() {
  materialLocalError.value = false;
  if (!directory.value) { materialLocalStatus.value = '已保存在浏览器。可下载 Markdown，或到设置选择目录后写入。'; return; }
  if (directoryBusy.value) { materialLocalStatus.value = '目录正在使用，本次资料尚未写入；完成后点击“写入目录”重试。'; materialLocalError.value = true; return; }
  directoryBusy.value = true;
  materialLocalStatus.value = '正在写入目录…';
  const handle = directory.value;
  try {
    const result = await writeCurrentDirectory(handle, true);
    materialLocalStatus.value = `已写入并同步到“${handle.name || '所选目录'}”：${result.changed} 条变化，${result.unchanged} 条未变更。`;
  } catch (cause) { materialLocalError.value = true; materialLocalStatus.value = `资料已留在浏览器，目录未完成写入：${cause instanceof Error ? cause.message : '请重新选择目录并重试。'}`; }
  finally { directoryBusy.value = false; }
}
const importingTask = ref('');
const busy = ref(false);
const editingMaterial = ref('');
function newMaterial() { editingMaterial.value = ''; materialTitle.value = ''; materialText.value = ''; materialKind.value = '阅读笔记'; materialReferences.value = []; materialSpace.value = materialLibrary.value === '*' ? '' : materialLibrary.value; materialSaveLocal.value = true; openModal('material'); }
function editMaterial(id: string) { const value = state.materials.find(m => m.id === id); if (!value) return; editingMaterial.value = id; materialTitle.value = value.name; materialText.value = value.excerpt; materialKind.value = value.kind; materialSpace.value = value.spaceId || ''; materialReferences.value = [...(value.referenceIds || [])]; materialSaveLocal.value = true; openModal('material'); }
async function addMaterial() {
  if (!materialTitle.value.trim()) return;
  if (!editingMaterial.value && state.materials.length >= 50) { error.value = '原型最多保留 50 份资料记录。'; return; }
  const existing = state.materials.find(m => m.id === editingMaterial.value);
  if (materialSpace.value && !state.spaces.some(s => s.id === materialSpace.value)) { error.value = '所属方向已不存在，请重新选择资料库。'; return; }
  const record: Material = { ...existing, guide: existing?.excerpt === materialText.value ? existing.guide : undefined, referenceIds: materialReferences.value.filter(id => id !== materialSpace.value && state.spaces.some(s => s.id === id)), id: existing?.id || uuid(), spaceId: materialSpace.value, name: materialTitle.value.trim(), kind: materialKind.value, size: existing?.sourceHash ? existing.size : new Blob([materialText.value]).size, date: new Date().toISOString(), excerpt: materialText.value, demo: false };
  if (existing) Object.assign(existing, record); else state.materials.push(record);
  if (materialLibrary.value !== '*') materialLibrary.value = materialSpace.value;
  const saveLocal = materialSaveLocal.value;
  closeModal(); tell(existing ? '资料记录已更新。' : '学习记录已保存。');
  if (saveLocal) {
    if (directory.value) await saveMaterialsLocally();
    else { downloadMaterial(record); materialLocalStatus.value = '已发起 Markdown 下载；绑定目录后可直接写入工作区。'; materialLocalError.value = false; }
  } else materialLocalStatus.value = '本次仅保存在浏览器，尚未写入目录。';
}
async function deleteMaterial(id: string) { const index = state.materials.findIndex(m => m.id === id); if (index < 0 || !await askDelete('删除这份资料记录？原始文件不会被删除。')) return; const previousId = history.value[0]?.id; state.materials.splice(index, 1); state.tasks.forEach(task => { task.materialIds = task.materialIds.filter(materialId => materialId !== id); }); deleted('资料记录已删除，并已解除相关行动的资料关联。', previousId); }
async function registerFiles(event: Event, task?: typeof state.tasks[number]) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  const targetLibrary = task?.spaceId ?? uploadTarget.value;
  const taskId = task?.id;
  const createGuides = autoGuide.value && connectionReady(activeAiConnection.value);
  if (busy.value || !files.length) return;
  importingTask.value = taskId || '';
  if (!taskId && visibleLibraryTool.value === 'import') selectedLibraryTool.value = 'import';
  busy.value = true;
  try {
    if (files.length > 50 || (!taskId && state.materials.length + files.length > 50)) throw new Error('最多保留 50 份资料记录，请减少选择。');
    if (files.some(f => f.size > 100 * 1024 * 1024)) throw new Error('单文件请控制在 100 MB 内。');
    const records: Material[] = [];
    for (const file of files) {
      const hash = await sourceHash(file);
      let excerpt = '', extractionNote: string | undefined;
      try { excerpt = await extractFile(file); }
      catch (e) { extractionNote = '已保存原件，正文提取失败。' + (e instanceof Error ? e.message.slice(0, 180) : '请检查文件格式。'); }
      await saveOriginal(hash, file);
      records.push({ id: uuid(), spaceId: targetLibrary, name: file.name.slice(0, 200), sourceName: file.name.slice(0, 200), sourceHash: hash,
        extractionNote, kind: excerpt.trim() ? '阅读笔记' : '文件信息', size: file.size, date: new Date().toISOString(), excerpt, demo: false,
        guide: state.materials.find(m => m.excerpt === excerpt && m.guide)?.guide });
    }
    if (targetLibrary && !state.spaces.some(s => s.id === targetLibrary)) throw new Error('所选归属已变化，请重新选择。');
    const currentTask = state.tasks.find(t => t.id === taskId);
    if (taskId && (!currentTask || currentTask.spaceId !== targetLibrary)) throw new Error('行动已移动或删除，请在当前行动中重新导入。');
    const additions: Material[] = [];
    const selected = new Set<string>();
    for (const record of records) {
      const existing = currentTask && [...state.materials, ...additions].find(m =>
        m.spaceId === targetLibrary && m.sourceHash === record.sourceHash && m.sourceName === record.sourceName);
      if (!existing) additions.push(record);
      selected.add(existing?.id || record.id);
    }
    if (state.materials.length + additions.length > 50) throw new Error('最多保留 50 份资料记录，请减少选择。');
    state.materials.push(...additions);
    if (currentTask) {
      for (const id of selected) toggleTaskMaterial(currentTask, id, true);
      tell(`已关联 ${selected.size} 份资料到“${currentTask.title}”。`);
    } else tell(`已保存 ${selected.size} 份资料到“${materialLibraryName(targetLibrary)}”。`);
    if (createGuides) {
      for (const id of selected) await analyzeRecord(id);
    }
    await saveMaterialsLocally();
    if (currentTask && materialLocalError.value) tell(materialLocalStatus.value);
  } catch (e) { tell(e instanceof Error ? e.message : '资料读取失败。'); }
  finally { busy.value = false; importingTask.value = ''; input.value = ''; }
}
function createReview() {
  if (state.reviews.length >= 30) { tell('最多保留 30 份小结，请先导出整理。'); return; }
  const body = [`截至 ${day()}，共记录 ${state.spaces.length} 个方向、${state.tasks.length} 个行动，其中 ${completed.value} 个已勾选完成。`,
    ...state.spaces.map(s => { const p = progress(s.id); return `${s.title}：完成 ${p.done}/${p.total} 个已登记行动。${s.milestone}`; }),
    `资料与自述共 ${state.materials.length} 份。尚未完成的行动计划投入合计 ${totalMinutes.value} 分钟，并非实际学习时长。`,
    '待复盘：哪些成果能支持本阶段的进步？哪里仍有困难？下一阶段需要调整什么？',
    '本小结按记录整理，包含工作区中的示例内容，不构成 AI 能力评估。'].join('\n\n');
  state.reviews.push({ id: uuid(), title: `${day()} · 执行小结`, date: new Date().toISOString(), body }); tell('已生成一份执行小结。');
}
const editingReview = ref('');
const reviewTitle = ref('');
const reviewBody = ref('');
function editReview(id: string) { const value = state.reviews.find(r => r.id === id); if (!value) return; if (value.assessment) { if (value.spaceId) router.push(spaceRoute(value.spaceId)); else tell('原节点已删除，验收快照可导出或删除。'); return; } editingReview.value = id; reviewTitle.value = value.title; reviewBody.value = value.body; openModal('reviewEdit'); }
function saveReviewEdit() { const value = state.reviews.find(r => r.id === editingReview.value); if (!value || !reviewTitle.value.trim()) return; value.title = reviewTitle.value.trim(); value.body = reviewBody.value.trim(); closeModal(); tell('阶段回顾已更新。'); }
async function deleteReview(id: string) { const index = state.reviews.findIndex(r => r.id === id); if (index < 0 || !await askDelete('删除这份阶段回顾？')) return; const previousId = history.value[0]?.id; state.reviews.splice(index, 1); deleted('阶段回顾已删除。', previousId); }

const aiPrompt = ref('');
const aiIntent = ref('refine');
const aiIntents = [{ id: 'refine', label: '细化分支', hint: '优先复用已有分支；没有分支时提出可调整的子方向结构，并安排少量近期行动。' }, { id: 'adjust', label: '调整计划', hint: '调整已有分支和行动，避免重复新增。' }, { id: 'review', label: '评估进展', hint: '直接说明已完成什么、目前在哪一步、下一步最值得做什么。尊重完成记录，缺少总结不等于没有做；能力判断另据实际表现。默认只回答，不自动新增回顾或改写方向。' }, { id: 'discuss', label: '先讨论', hint: '只讨论建议和必要澄清问题，不生成修改操作。' }];
const aiScope = ref('');
const aiIncludeGlobalMaterials = ref(false);
const aiSources = computed(() => aiScope.value && !state.spaces.some(s => s.id === aiScope.value) ? undefined : aiSourceWorkspace(aiScope.value, aiIncludeGlobalMaterials.value));
const aiCandidates = computed(() => aiSources.value && buildAiWorkspace(preferences.mode, aiScope.value, aiIncludeGlobalMaterials.value, aiSources.value, aiPrompt.value));
const aiPlan = computed(() => {
  if (!aiSources.value || !aiCandidates.value) return undefined;
  const request = `本轮模式：${aiIntents.find(i => i.id === aiIntent.value)?.hint}\n用户补充：${aiPrompt.value.trim()}`;
  return prepareProposal(aiSources.value, aiCandidates.value, aiScope.value ? aiScopeLabel.value + ' [' + aiScope.value + ']' : '整个工作区', request,
    preferences.mode, activeAiConnection.value?.protocol || 'responses', activeAiConnection.value?.model.trim().slice(0, 200) || '');
});
const aiMaterialSelection = computed(() => aiPlan.value?.workspace.materials || []);
const aiRoot = computed({
  get: () => { const node = state.spaces.find(s => s.id === aiScope.value); return node ? spaceAncestors(node.id)[0]?.id || node.id : ''; },
  set: (id: string) => { aiScope.value = id; },
});
const aiBranchOptions = computed(() => spaceTreeRows.value.filter(row => row.space.id !== aiRoot.value && spaceAncestors(row.space.id).some(parent => parent.id === aiRoot.value)));
const aiBusy = ref(false);
const aiError = ref('');
const aiStatus = computed(() => ({ configured: connectionReady(activeAiConnection.value), model: activeAiConnection.value?.model || '', name: activeAiConnection.value?.name || '' }));
const aiProposal = ref<AiProposal>();
const selectedOperations = ref<string[]>([]);
const aiIssues = computed(() => proposalIssues(state, aiProposal.value?.operations.filter(row => selectedOperations.value.includes(row.id)) || [], aiScope.value));
const aiPreview = computed(() => {
  const chosen = aiProposal.value?.operations.filter(row => selectedOperations.value.includes(row.id)) || [];
  if (!chosen.length) return {};
  if (aiIssues.value.size) return { error: '请先处理提案中标出的归属或依赖问题。' };
  try { return { after: proposalWorkspace(state, chosen, aiScope.value, previewIdFactory(state)) }; }
  catch { return { error: '提案包含无效字段、关联或受保护的验收记录，请检查后再采纳。' }; }
});

const proposalOwner = (row: ProposalOperation) => {
  const existing = row.entity === 'space' ? state.spaces.find(s => s.id === row.targetId)?.parentId : row.entity === 'task' ? state.tasks.find(t => t.id === row.targetId)?.spaceId : '';
  const id = (row.entity === 'space' ? row.fields.parentId : row.fields.spaceId) || existing || aiScope.value;
  return state.spaces.find(s => s.id === id)?.title || aiProposal.value?.operations.find(r => r.entity === 'space' && r.targetId === id)?.fields.title || '工作区';
};
watch(aiScope, () => { aiProposal.value = undefined; selectedOperations.value = []; aiError.value = ''; });
const actionLabel = (operation: ProposalOperation) => ({ create: '新增', update: '调整', delete: '删除' }[operation.action]);
const entityLabel = (operation: ProposalOperation) => ({ space: '方向', task: '行动', material: '资料', draft: '草稿', review: '回顾' }[operation.entity]);
const readableText = (text: string) => readableReferences(text, state, aiProposal.value?.operations);
const operationTitle = (operation: ProposalOperation) => readableText(operation.fields.title || recordTitle(state, operation) || operation.fields.text.slice(0, 60) || `${entityLabel(operation)}（记录已不存在）`);
const aiScopeLabel = computed(() => aiScope.value ? state.spaces.find(space => space.id === aiScope.value)?.title || '当前方向' : '整个工作区');
watch(() => route.query.scope, value => { aiScope.value = typeof value === 'string' && state.spaces.some(space => space.id === value) ? value : ''; }, { immediate: true });
watch(() => route.query.intent, value => { if (value === 'refine') { aiIntent.value = 'refine'; aiPrompt.value = '请结合已有内容继续细化子方向，复用已有分支，将不确定之处标为暂定，并为近期分支安排具体起步行动。'; } }, { immediate: true });
async function generateAiProposal() {
  const plan = aiPlan.value;
  if (!aiPrompt.value.trim() || !plan || plan.blocked || aiBusy.value) return;
  const requestedScope = aiScope.value;
  aiBusy.value = true; aiError.value = ''; aiProposal.value = undefined;
  try {
    const proposal = await requestAiProposal(plan.request, plan.context, plan.workspace, activeAiConnection.value, plan.mode);
    if (aiScope.value !== requestedScope) return;
    aiProposal.value = proposal; selectedOperations.value = proposal.operations.map(row => row.id);
  } catch (cause) { aiError.value = cause instanceof Error ? cause.message : 'AI 提案生成失败。'; }
  finally { aiBusy.value = false; }
}
function applyAiProposal() {
  if (!aiProposal.value) return;
  const chosen = aiProposal.value.operations.filter(row => selectedOperations.value.includes(row.id));
  if (!chosen.length) { aiError.value = '请至少选择一项提案。'; return; }
  const issues = proposalIssues(state, chosen, aiScope.value);
  if (issues.size) { aiError.value = '请查看提案中标出的具体问题，补选依赖分支或取消对应操作。'; return; }
  try {
    replaceWorkspace(proposalWorkspace(state, chosen, aiScope.value), '采纳 AI 提案'); aiProposal.value = undefined; aiPrompt.value = ''; tell(`已采纳 ${chosen.length} 项 AI 提案。`);
  } catch (cause) { aiError.value = cause instanceof Error ? cause.message : '提案未能应用。'; }
}
const pendingImport = ref<Workspace>();
const pendingDirectoryChanges = ref<string[]>([]);
function applyImport() {
  if (!pendingImport.value) return;
  try {
    replaceWorkspace(pendingImport.value); pendingImport.value = undefined; closeModal(); tell('已从目录读取工作区并替换浏览器中的内容。');
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败。'; }
}
const contextText = computed(() => buildContext(preferences.mode));
const qualityModes = [{ id: 'standard', title: '标准', caption: '日常推进', detail: '最近 3 份资料 · 短摘录' }, { id: 'high', title: '高', caption: '阶段梳理', detail: '最近 8 份资料 · 更多证据' }, { id: 'highest', title: '最高', caption: '复杂规划', detail: '最近 15 份资料 · 较完整摘录' }] as const;
function exportContext() { downloadFile(`edu-context-${day()}.md`, contextText.value, 'text/markdown;charset=utf-8'); tell('讨论接续包已发起下载，可直接交给本地 AI 会话。'); }
const directory = ref<DirectoryHandle>();
const directorySupported = window.isSecureContext && typeof window.showDirectoryPicker === 'function';
const directorySupportMessage = !window.isSecureContext
  ? '当前是局域网 HTTP 测试地址。浏览器不会授予文件夹读写权限；请在本机用 http://localhost:4180 的 Chrome 或 Edge 选择目录。局域网链接仍可用于查看页面和测试浏览器内数据。'
  : !window.showDirectoryPicker
    ? '当前浏览器不支持选择文件夹。请使用桌面版 Chrome 或 Edge 的安全页面打开。'
    : '所有修改会先保存在浏览器；点击写入后，才将当前完整工作区同步到目录。写入只更新变化记录，并在最后更新索引；读取前会校验每个文件的 SHA-256。';
const directoryBusy = ref(false);
const directoryWriteLabel = computed(() => {
  const status = preferences.directoryWrite;
  if (!status) return '尚未写入目录';
  return `上次成功写入“${status.directoryName}” · ${timeLabel(status.at)} · ${status.changed} 条变化`;
});
async function writeCurrentDirectory(handle: DirectoryHandle, protectExternalChanges: boolean) {
  await nextTick();
  const revision = storageError.value ? undefined : savedRevision.value;
  const snapshot = copyWorkspace();
  const result = await writeWorkspaceFolder(handle, snapshot, protectExternalChanges);
  recordDirectoryWrite({ revision, directoryName: handle.name, ...result });
  return result;
}
async function bindDirectory() {
  try { directory.value = await chooseDirectory(); tell('工作区目录已选择。你可以读取已有内容或将当前内容写入目录。'); }
  catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) tell(e instanceof Error ? e.message : '目录绑定失败。'); }
}
async function saveToDirectory() {
  if (!directory.value) return;
  directoryBusy.value = true;
  try {
    const result = await writeCurrentDirectory(directory.value, false);
    tell(`目录工作区已更新：${result.changed} 条变化，${result.unchanged} 条未变更。`);
  }
  catch (e) { tell(e instanceof Error ? e.message : '目录写入失败，请重新选择目录。'); }
  finally { directoryBusy.value = false; }
}
async function readFromDirectory() {
  if (!directory.value) return;
  directoryBusy.value = true;
  try {
    const result = await readWorkspaceFolder(directory.value);
    pendingDirectoryChanges.value = result.externalChanges;
    pendingImport.value = validateWorkspace(result.workspace);
    await openModal('import');
  } catch (e) { tell(e instanceof Error ? e.message : '目录工作区读取失败。'); }
  finally { directoryBusy.value = false; }
}
async function unbindDirectory() {
  try { await disconnectDirectory(); directory.value = undefined; tell('已解除目录绑定，目录内的文件保留。'); }
  catch { tell('解除绑定失败，请重试。'); }
}
function confirmReset() { try { resetDemo(); closeModal(); tell('已恢复示例内容，目录内文件不会自动改动。'); } catch (e) { error.value = e instanceof Error ? e.message : '恢复失败。'; } }
function confirmClear() { try { clearWorkspace(); closeModal(); tell('浏览器中的测试工作区已清空，可以从第一条规划开始。'); router.push('/planner'); } catch (e) { error.value = e instanceof Error ? e.message : '清空失败。'; } }
onMounted(async () => {
  const savedDirectory = await loadDirectory();
  if (savedDirectory) directory.value = savedDirectory;
});
</script>

<template>
  <div class="app-shell">
    <a href="#main-content" class="skip-link" :inert="mobileNav">跳到主内容</a>
    <div v-if="mobileNav" class="nav-backdrop" @click="closeNav"></div>
    <aside id="workspace-navigation" class="sidebar" :inert="mobileLayout && !mobileNav" :role="mobileNav ? 'dialog' : undefined" :aria-modal="mobileNav || undefined" aria-label="工作区导航" @keydown.esc.stop="closeNav" @keydown.tab="cycleDrawer" :class="{ 'is-open': mobileNav }">
      <button v-if="mobileNav" ref="drawerClose" class="icon-button drawer-close" aria-label="关闭导航" @click="closeNav"><Icon name="close" /></button>
      <RouterLink to="/" class="brand" @click="closeNav"><span class="brand-mark"><Icon name="book" :size="22" /></span><span>知序<span class="brand-divider">/</span><small>EDU</small></span></RouterLink>
      <RouterLink to="/" class="back-portal" @click="closeNav"><Icon name="arrow" :size="14" class="reverse" /> 教育空间首页</RouterLink>
      <div class="nav-label">我的学习空间</div><nav class="side-nav"><RouterLink v-for="item in nav" :key="item.path" :to="item.path" :class="{ selected: route.path === item.path || (item.path === '/planner' && isSpaceDetail) }" @click="closeNav"><Icon :name="item.icon" :size="19" /><span>{{ item.title }}</span><span v-if="item.path === '/planner/today' && pendingDailyCount" class="nav-count">{{ pendingDailyCount }}</span></RouterLink></nav>
      <div class="sidebar-quote"><span>每一步，都算数。</span><p>给长期的事一点耐心，<br>给今天的自己一个起点。</p><div class="quote-line"></div></div>
      <div class="sidebar-bottom"><RouterLink to="/settings" :class="{ selected: route.path === '/settings' }" @click="closeNav"><Icon name="settings" :size="19" /> 设置</RouterLink><div class="device-mini"><span class="device-icon"><Icon name="folder" :size="19" /></span><div><strong>{{ directory?.name || '浏览器工作区' }}</strong><small><span class="status-dot"></span> {{ directory ? '目录已选择' : '等待选择目录' }}</small></div></div></div>
    </aside>
    <div class="main-shell" :inert="mobileNav">
      <header class="topbar"><div class="breadcrumbs"><button class="icon-button mobile-menu" ref="menuButton" aria-label="打开导航" aria-controls="workspace-navigation" :aria-expanded="mobileNav" @click="openNav"><Icon name="menu" /></button><span>学习空间</span><span class="crumb-slash">/</span><strong>{{ pageTitle }}</strong></div><div class="topbar-right"><span class="prototype-badge">本地原型 <span>· 示例可编辑</span></span><span class="avatar" aria-label="个人空间">我</span></div></header>
      <div v-if="storageError" class="storage-warning" role="alert">{{ storageError }} <RouterLink to="/settings" class="text-link">选择工作区目录</RouterLink></div>
      <main id="main-content" tabindex="-1" class="workspace" :class="{ 'schedule-mode-day': route.path === '/planner/schedule' && scheduleViewMode === 'day', 'schedule-mode-week': route.path === '/planner/schedule' && scheduleViewMode === 'week', 'schedule-mode-month': route.path === '/planner/schedule' && scheduleViewMode === 'month' }">
        <template v-if="route.path === '/planner' || route.path === '/planner/today'">
          <div class="page-heading"><div><div class="eyebrow">{{ currentDate }}</div><h1>{{ route.path === '/planner' ? '我的大方向' : '从今天的一小步开始。' }}</h1><p>{{ route.path === '/planner' ? '选择一个大方向，进入子方向目录，再安排具体行动。' : '只看眼前需要推进的事，也给计划留一点余地。' }}</p></div><button v-if="route.path === '/planner/today'" class="button secondary" @click="newTask()"><Icon name="plus" :size="17" /> 添加行动</button></div>
          <DirectionOverview v-if="route.path === '/planner'" :spaces="rootSpaces" :progress="progress" :child-count="id => spaceChildren(id).length" @create="newSpace()" @start="openModal('starter')" @edit="newSpace" />
          <div v-if="route.path === '/planner/today'" class="work-grid"><DailyActions :groups="actionGroups" :directions="directionOptions" :subtree="spaceTaskIds" :today="queueDate" :date-label="chineseDate" :space-name="spaceName" :mode-label="actionModeLabel" @edit="editTask" @create="newTask()" />
          <aside class="panel discussion-panel"><div class="section-heading"><h2><Icon name="spark" :size="18" /> 一起把想法理清楚</h2><RouterLink to="/planner/ai" class="tiny-badge">AI 规划</RouterLink></div><p class="discussion-intro">还没想清楚也没关系。先记下来，<br>再让 AI 根据现有记录提出可选择的调整。</p><form @submit.prevent="saveDraft"><label class="sr-only" for="draft">想法草稿</label><textarea id="draft" v-model="draftText" maxlength="3000" rows="4" placeholder="比如：我想用三个月打好论文阅读的基础，但还不知道从哪里开始……"></textarea><div class="draft-actions"><span><span class="status-dot neutral"></span> 本地草稿</span><button class="button primary compact" :disabled="!draftText.trim()" type="submit">记下想法 <Icon name="arrow" :size="14" /></button></div></form><div v-if="recentDrafts.length" class="saved-drafts"><div v-for="draft in recentDrafts" :key="draft.id" class="saved-draft"><small v-if="draft.spaceId" class="draft-owner">{{ spaceName(draft.spaceId) }}</small><p>{{ draft.text }}</p><div class="record-actions"><button v-if="!draft.applied" class="text-link" @click="newTask(undefined, draft)">转为行动</button><button class="text-link" @click="editDraft(draft.id)">调整</button><button class="text-link danger" @click="deleteDraft(draft.id)">删除</button></div><span v-if="draft.applied" class="small muted">已转为行动</span></div></div><RouterLink to="/planner/ai" class="context-entry"><span><Icon name="spark" :size="17" /> 让 AI 帮我整理计划</span><Icon name="arrow" :size="16" /></RouterLink></aside></div>
        </template>

        <template v-else-if="route.path === '/planner/schedule'">
          <div class="page-heading schedule-heading"><div><div class="eyebrow">日常安排 · {{ scheduleViewLabel }}</div><h1>{{ scheduleViewMode === 'month' ? scheduleMonthKey.replace('-', ' 年 ') + ' 月' : '日程安排' }}</h1></div><button class="button primary" @click="newSchedule()"><Icon name="plus" :size="17" /> 添加日程</button></div>

          <section class="panel schedule-view-toolbar"><div class="schedule-period-actions"><button class="icon-button" :aria-label="scheduleViewMode === 'month' ? '上个月' : scheduleViewMode === 'week' ? '上一周' : '前一天'" @click="shiftSchedulePeriod(-1)"><Icon name="arrow" :size="15" class="reverse" /></button><button class="icon-button" :aria-label="scheduleViewMode === 'month' ? '下个月' : scheduleViewMode === 'week' ? '下一周' : '后一天'" @click="shiftSchedulePeriod(1)"><Icon name="arrow" :size="15" /></button><button class="text-link" :disabled="scheduleIsToday" @click="goScheduleToday">回到今天</button><input v-model="scheduleDate" type="date" aria-label="选择日程日期"></div><div class="schedule-view-switch" role="group" aria-label="日程视图"><button class="schedule-view-button" :class="{ active: scheduleViewMode === 'day' }" aria-label="日视图" :aria-pressed="scheduleViewMode === 'day'" @click="scheduleViewMode = 'day'">日</button><button class="schedule-view-button" :class="{ active: scheduleViewMode === 'week' }" aria-label="周视图" :aria-pressed="scheduleViewMode === 'week'" @click="scheduleViewMode = 'week'">周</button><button class="schedule-view-button" :class="{ active: scheduleViewMode === 'month' }" aria-label="月视图" :aria-pressed="scheduleViewMode === 'month'" @click="scheduleViewMode = 'month'">月</button></div></section>
          <section v-if="scheduleViewMode === 'week'" class="schedule-period-view schedule-week-view"><details class="schedule-period-details"><summary><span>本周概览</span><strong>{{ scheduleWeekEntries.length }} 项安排 · {{ scheduleWeekDaysWithEntries }} 天有记录</strong><strong class="schedule-week-free">剩余可安排 {{ minutesLabel(scheduleWeekBudget.free) }}</strong><span v-if="scheduleWeekBudget.overDays" class="schedule-week-over">{{ scheduleWeekBudget.overDays }} 天超额</span><span class="schedule-disclosure-hint"><span class="when-collapsed">展开统计</span><span class="when-expanded">收起统计</span></span></summary><div class="schedule-period-summary-grid"><article class="panel schedule-period-stat"><span>本周安排</span><strong>{{ scheduleWeekEntries.length }} 项</strong><small>{{ scheduleWeekDaysWithEntries }} 天有记录</small></article><article class="panel schedule-period-stat"><span>时间投入</span><strong>{{ minutesLabel(scheduleWeekMinutes) }}</strong><small>只统计有开始与结束时间的日程</small></article><article class="panel schedule-period-stat"><span>重要 / 节假日</span><strong>{{ scheduleWeekImportant.length }} / {{ scheduleWeekHolidays.length }}</strong><small>按当前周手动标记</small></article><article class="panel schedule-period-stat"><span>剩余生活基线</span><strong>{{ minutesLabel(scheduleWeekBudget.baseline) }}</strong><small>逐日应用工作日与休息日规则</small></article><article class="panel schedule-period-stat"><span>剩余可安排</span><strong>{{ minutesLabel(scheduleWeekBudget.free) }}</strong><small>每天剩余时间相加，最低按零计算</small></article><article class="panel schedule-period-stat"><span>超额安排</span><strong>{{ minutesLabel(scheduleWeekBudget.over) }}</strong><small>{{ scheduleWeekBudget.overDays }} 天超额，不抵消其他日期的空闲</small></article></div><p class="help-text schedule-week-budget-note">{{ scheduleWeekDates[0] }} 至 {{ scheduleWeekDates[6] }}。{{ scheduleWeekBudget.past ? '该周期已结束，没有剩余时间。' : scheduleWeekBudget.fromNow ? '从当前时间计算到周期结束，已过去的日期和时段不计入，每分钟更新。' : '未来周期按全部日期计算。' }} 使用当前生活基线；今天的时间段仅扣除尚未结束的部分，按分钟设置的基线因无法判断使用情况，仍预留今天的全部预算。全天标记不占时长，重叠安排按时长相加；假期以已同步数据和手动标记为准。</p></details><section class="panel schedule-week-grid-panel"><div class="section-heading"><div><span class="section-number">周分布</span><h2>{{ scheduleDateLabel }}所在周</h2></div><span class="small muted">点击一天进入日视图</span></div><div class="schedule-week-grid"><button v-for="dayInfo in scheduleWeekGridDays" :key="dayInfo.date" class="schedule-week-day-card" :class="{ selected: dayInfo.date === scheduleDate, today: dayInfo.date === day(), weekend: isWeekend(dayInfo.date) }" @click="selectCalendarDate(dayInfo.date)"><div class="schedule-week-day-head"><span>{{ scheduleWeekday(dayInfo.date) }}</span><strong>{{ Number(dayInfo.date.slice(-2)) }}</strong><em v-if="makeupWorkdayFor(dayInfo.date)" class="makeup">补班</em><em v-else-if="hasHolidayFor(dayInfo.date)">休</em></div><div v-if="dayInfo.entries.length" class="schedule-week-day-entries"><span v-for="entry in dayInfo.entries.slice(0, 4)" :key="entry.id" class="schedule-week-day-entry" :class="entry.type">{{ entry.allDay ? entry.title : entry.start + ' ' + entry.title }}</span><small v-if="dayInfo.entries.length > 4">+{{ dayInfo.entries.length - 4 }} 项</small></div><span v-else class="schedule-week-empty">留白</span></button></div><div class="panel-footnote"><Icon name="info" :size="14" /> 周视图用于看分布，不替代日视图里的具体时间预算。</div></section></section>
          <section v-if="scheduleViewMode === 'month'" class="schedule-period-view schedule-month-view"><details class="schedule-period-details"><summary><span>本月概览</span><strong>{{ scheduleMonthEntries.length }} 项安排 · {{ scheduleMonthDaysWithEntries }} 天有记录</strong><strong class="schedule-month-free">剩余可安排 {{ minutesLabel(scheduleMonthBudget.free) }}</strong><span v-if="scheduleMonthBudget.overDays" class="schedule-month-over">{{ scheduleMonthBudget.overDays }} 天超额</span><span class="schedule-disclosure-hint"><span class="when-collapsed">展开统计</span><span class="when-expanded">收起统计</span></span></summary><div class="schedule-period-summary-grid schedule-month-summary"><article class="panel schedule-period-stat"><span>本月安排</span><strong>{{ scheduleMonthEntries.length }} 项</strong><small>{{ scheduleMonthDaysWithEntries }} 天有记录</small></article><article class="panel schedule-period-stat"><span>时间投入</span><strong>{{ minutesLabel(scheduleMonthMinutes) }}</strong><small>不包含全天标记的日期</small></article><article class="panel schedule-period-stat"><span>重要日 / 节假日</span><strong>{{ scheduleMonthImportant.length }} / {{ scheduleMonthHolidayCount }}</strong><small>另有 {{ scheduleMonthApiMakeupWorkdays.length }} 个补班日</small></article><article class="panel schedule-period-stat"><span>剩余生活基线</span><strong>{{ minutesLabel(scheduleMonthBudget.baseline) }}</strong><small>逐日应用工作日与休息日规则</small></article><article class="panel schedule-period-stat"><span>剩余可安排</span><strong>{{ minutesLabel(scheduleMonthBudget.free) }}</strong><small>每天剩余时间相加，最低按零计算</small></article><article class="panel schedule-period-stat"><span>超额安排</span><strong>{{ minutesLabel(scheduleMonthBudget.over) }}</strong><small>{{ scheduleMonthBudget.overDays }} 天超额，不抵消其他日期的空闲</small></article></div><p class="help-text schedule-month-budget-note">{{ scheduleMonthLabel }} · 共 {{ scheduleMonthBudget.days }} 天。{{ scheduleMonthBudget.past ? '该周期已结束，没有剩余时间。' : scheduleMonthBudget.fromNow ? '从当前时间计算到周期结束，已过去的日期和时段不计入，每分钟更新。' : '未来周期按全部日期计算。' }} 使用当前生活基线；今天的时间段仅扣除尚未结束的部分，按分钟设置的基线因无法判断使用情况，仍预留今天的全部预算。全天标记不占时长，重叠安排按时长相加；假期以已同步数据和手动标记为准。</p></details><div class="schedule-holiday-tools"><span><Icon name="leaf" :size="14" /> {{ scheduleHolidaySyncLabel }}</span><button class="text-link" :disabled="scheduleHolidaySyncing" @click="syncScheduleHolidays()">{{ scheduleHolidaySyncing ? '同步中…' : `同步 ${scheduleMonthKey.slice(0, 4)} 年节假日` }}</button></div><p v-if="scheduleHolidayError" class="form-error schedule-holiday-error" role="alert">同步失败：{{ scheduleHolidayError }}。仍可手动添加节假日。</p><section class="panel schedule-month-panel"><div class="schedule-month-weekdays"><span v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']" :key="weekday">{{ weekday }}</span></div><div class="schedule-month-grid"><div v-for="value in scheduleMonthGridDates" :key="value" class="schedule-month-cell" :class="{ outside: !value.startsWith(scheduleMonthKey), selected: value === scheduleDate, today: value === day(), weekend: isWeekend(value), holiday: hasHolidayFor(value), makeup: makeupWorkdayFor(value) }" @click="selectCalendarDate(value)"><div class="schedule-month-cell-head"><button type="button" class="schedule-month-date-button" :aria-label="`进入${chineseDate(value)}日视图`" @click.stop="selectCalendarDate(value)"><span class="schedule-month-date">{{ Number(value.slice(-2)) }}</span><small v-if="makeupWorkdayFor(value)" class="schedule-month-makeup-label">补班</small><small v-else-if="holidayLabelFor(value)" class="schedule-month-holiday-label">{{ holidayLabelFor(value) }}</small><small v-else-if="isWeekend(value)" class="schedule-month-weekend-label">周末</small><small v-else-if="scheduleEntriesFor(value).length" class="schedule-month-count">{{ scheduleEntriesFor(value).length }}项</small></button><button type="button" class="schedule-month-add" :aria-label="`在${chineseDate(value)}添加日程`" @click.stop="newSchedule(value)"><Icon name="plus" :size="13" /></button></div><button v-for="entry in scheduleEntriesFor(value).slice(0, 4)" :key="entry.id" type="button" class="schedule-month-entry" :class="entry.type" @click.stop="editSchedule(entry.id)"><span class="schedule-month-time">{{ entry.allDay ? '全天' : entry.start }}</span><span class="schedule-month-entry-copy"><strong>{{ entry.title }}</strong><small>{{ scheduleCategoryLabel(entry.category) }}<template v-if="entry.taskId"> · 关联行动</template></small></span></button><small v-if="scheduleEntriesFor(value).length > 4" class="schedule-month-more">+{{ scheduleEntriesFor(value).length - 4 }} 项，点击日期查看</small></div></div><div class="panel-footnote"><Icon name="info" :size="14" /> 每个日期都可以直接添加；点击具体安排可调整，不需要拖动。节假日和补班数据可同步，也保留手动维护入口。</div></section></section>
          <section class="panel schedule-week-panel"><div class="schedule-week-toolbar"><div class="schedule-date-actions"><button class="icon-button" aria-label="前一天" title="前一天" @click="shiftScheduleDate(-1)"><Icon name="arrow" :size="15" class="reverse" /></button><button class="icon-button" aria-label="后一天" title="后一天" @click="shiftScheduleDate(1)"><Icon name="arrow" :size="15" /></button><button class="text-link" :disabled="scheduleIsToday" @click="goScheduleToday">回到今天</button></div><input v-model="scheduleDate" type="date" aria-label="选择日程日期"></div><div class="schedule-week-strip"><button v-for="value in scheduleWeekDates" :key="value" class="schedule-day-cell" :class="{ selected: value === scheduleDate, today: value === day(), weekend: isWeekend(value) }" @click="selectScheduleDate(value)"><span>{{ scheduleWeekday(value) }}</span><strong>{{ Number(value.slice(-2)) }}</strong><small v-if="makeupWorkdayFor(value)" class="schedule-holiday-dot">补班</small><small v-else-if="hasHolidayFor(value)" class="schedule-holiday-dot">休</small><small v-else-if="scheduleCountFor(value)">{{ scheduleCountFor(value) }}项</small></button></div></section>
          <div class="schedule-layout">
            <div class="schedule-main-column">
              <section class="schedule-summary-grid"><article class="panel schedule-stat-card"><span>基础安排</span><strong>{{ minutesLabel(routineMinutes) }}</strong><small>睡眠、工作、休息、吃饭与通勤</small></article><article class="panel schedule-stat-card"><span>{{ scheduleIsToday ? '今日额外日程' : '当天额外日程' }}</span><strong>{{ minutesLabel(scheduleDayMinutes) }}</strong><small>{{ scheduleDayEntries.length }} 项已排日程</small></article><article class="panel schedule-stat-card schedule-free-card"><span>还可安排</span><strong>{{ overbookedMinutes ? `超出 ${minutesLabel(overbookedMinutes)}` : minutesLabel(freeMinutes) }}</strong><small>{{ overbookedMinutes ? '请减少重叠或调整预算' : '不把空白时间误当作必须填满' }}</small></article></section>
              <section class="panel schedule-timeline-panel"><div class="section-heading"><div><span class="section-number">{{ scheduleDateLabel }}</span><h2>当天时间表 <span>{{ scheduleDayEntries.length }}</span></h2></div><button class="text-link" @click="newSchedule()"><Icon name="plus" :size="15" /> 在这天添加</button></div><div v-if="scheduleDayEntries.length" class="schedule-entry-list"><article v-for="entry in scheduleDayEntries" :key="entry.id" class="schedule-entry" :class="[`schedule-entry-${entry.type}`, { 'is-all-day': entry.allDay }]" @dblclick="editSchedule(entry.id)"><div class="schedule-entry-time"><strong>{{ entry.allDay ? '全天' : entry.start + ' — ' + entry.end }}</strong><small>{{ entry.allDay ? '全天安排' : minutesLabel(scheduleEntryMinutes(entry)) }}</small></div><div class="schedule-entry-body"><div class="schedule-entry-title"><span class="schedule-type-badge" :class="entry.type">{{ scheduleTypeLabel(entry.type) }}</span><strong>{{ entry.title }}</strong></div><p v-if="entry.note">{{ entry.note }}</p><div class="schedule-entry-links"><span>{{ scheduleCategoryLabel(entry.category) }}</span><span v-if="entry.spaceId">{{ spaceName(entry.spaceId) }}</span><button v-if="entry.taskId" class="text-link" @click.stop="editTask(entry.taskId)">关联行动：{{ state.tasks.find(task => task.id === entry.taskId)?.title || '已删除' }}</button><button class="text-link" :aria-label="'调整日程：' + entry.title" @click.stop="editSchedule(entry.id)">调整</button></div></div></article></div><div v-else class="empty-state schedule-empty"><Icon name="calendar" :size="28" /><p>这一天还没有日程。留出空白也是一种安排。</p><button class="button secondary" @click="newSchedule()">添加第一项</button></div><div class="panel-footnote"><Icon name="info" :size="14" /> 节假日与补班可在月视图同步；点击“调整”可修改当天安排。</div></section>
              <details v-if="scheduleDayHolidays.length || scheduleDayImportant.length" class="panel schedule-special-panel"><summary>节假日与重要日 <span>{{ scheduleDayHolidays.length + scheduleDayImportant.length }} 项</span></summary><div class="section-heading"><div><span class="section-number">当天标记</span><h2>节假日与重要日</h2></div><button class="text-link" @click="newSchedule()">添加标记</button></div><div class="schedule-special-list"><article v-for="entry in [...scheduleDayHolidays, ...scheduleDayImportant]" :key="entry.id" :class="entry.type"><span class="schedule-special-icon"><Icon :name="entry.type === 'holiday' ? 'leaf' : 'target'" :size="17" /></span><div><strong>{{ entry.title }}</strong><small>{{ entry.type === 'holiday' ? '节假日' : '重要日' }} · {{ entry.allDay ? '全天' : entry.start + ' — ' + entry.end }}</small></div><button class="text-link" :aria-label="'调整日程：' + entry.title" @click="editSchedule(entry.id)">调整</button></article></div></details>
            </div>
            <aside class="schedule-aside-column"><details class="panel schedule-baseline-panel"><summary>生活基线 <span>{{ minutesLabel(routineMinutes) }} / 天</span></summary><div class="section-heading"><div><span class="section-number">生活基线</span><h2>先安排固定的，再安排变化的。</h2></div><button class="text-link" @click="openScheduleSettings">管理时间基线 <Icon name="arrow" :size="14" /></button></div><div class="schedule-baseline-list"><button v-for="row in scheduleBaselineRows" :key="row.label" type="button" class="schedule-baseline-item" @click="openScheduleSettings"><span class="schedule-baseline-icon"><Icon name="clock" :size="15" /></span><span><strong>{{ row.label }}</strong><small>{{ row.detail }}</small></span><em>{{ row.value }}</em><Icon name="arrow" :size="14" /></button></div><p class="help-text schedule-baseline-help">这些是每天的时间预算，不是必须完成的任务；需要调整时，点任意一项即可打开统一管理。</p></details><section class="panel schedule-budget-panel"><div class="section-heading"><div><span class="section-number">每日时间预算</span><h2>{{ scheduleIsToday ? '今天的时间预算' : '当天的时间预算' }}</h2></div><span class="tiny-badge">按时长估算</span></div><div class="schedule-budget-bar"><span :style="{ width: `${budgetUsedPercent}%` }"></span></div><div class="schedule-budget-bar-label"><span>已安排 {{ budgetUsedPercent }}%</span><strong v-if="overbookedMinutes">超出 24 小时</strong><span v-else>空白 {{ minutesLabel(freeMinutes) }}</span></div><details class="schedule-budget-details"><summary>查看预算明细与计算说明</summary><div class="schedule-budget-breakdown"><span><i class="sleep"></i>睡眠 {{ minutesLabel(sleepMinutes) }}</span><span><i class="work"></i>工作 {{ minutesLabel(workMinutes) }}</span><span><i class="extra"></i>日程 {{ minutesLabel(scheduleDayMinutes) }}</span></div><p class="help-text schedule-budget-note">基础安排和额外日程按时长相加，不自动扣除重叠；如果出现“超出”，优先检查是否把同一段时间重复计算了。</p></details></section><section class="panel schedule-quick-panel"><div class="section-heading"><div><span class="section-number">快速入口</span><h2>把计划放进时间里</h2></div></div><button class="schedule-quick-link" @click="newSchedule(scheduleDate)"><span><Icon name="calendar" :size="17" /> 添加普通日程</span><Icon name="arrow" :size="15" /></button><button class="schedule-quick-link" @click="newSpecialSchedule('important')"><span><Icon name="target" :size="17" /> 添加重要日</span><Icon name="arrow" :size="15" /></button><button class="schedule-quick-link" @click="newSpecialSchedule('holiday')"><span><Icon name="leaf" :size="17" /> 标记节假日</span><Icon name="arrow" :size="15" /></button><p class="help-text">重要日和节假日也可以关联方向；关联行动后，日程会显示在行动旁边。</p></section></aside>
          </div>
        </template>

        <template v-else-if="isSpaceDetail">
          <div v-if="activeSpace" class="space-detail-page">
            <div class="detail-breadcrumbs"><RouterLink to="/planner">学习总览</RouterLink><span>/</span><span v-for="ancestor in spaceAncestors(activeSpace.id)" :key="ancestor.id"><RouterLink :to="spaceRoute(ancestor.id)">{{ ancestor.title }}</RouterLink><span> / </span></span><strong>{{ activeSpace.title }}</strong></div>
            <div class="page-heading"><div><div class="eyebrow">{{ activeSpace.parentId ? '子方向' : '大方向' }} · {{ spaceKindLabel(activeSpace.kind) }}<span v-if="spaceOriginLabel(activeSpace)"> · {{ spaceOriginLabel(activeSpace) }}</span></div><h1>{{ activeSpace.title }}</h1><details v-if="activeSpace.description" class="direction-description"><summary>查看方向说明</summary><p>{{ activeSpace.description }}</p></details></div><div class="inline-actions"><RouterLink :to="{ path: '/planner/materials', query: { library: activeSpace.id } }" class="button secondary"><Icon name="folder" :size="16" /> 资料库</RouterLink><RouterLink :to="{ path: '/planner/ai', query: { scope: activeSpace.id } }" class="button secondary"><Icon name="spark" :size="16" /> 让 AI 跟进</RouterLink><button class="button secondary" @click="newSpace(activeSpace.id)">调整方向</button></div></div>
            <section class="panel space-detail-summary"><div><span class="section-number">执行进度</span><strong>{{ progress(activeSpace.id).percent }}%</strong><p>整体执行进度 · {{ progress(activeSpace.id).done }}/{{ progress(activeSpace.id).total }} 个行动完成</p></div><div class="detail-progress"><div class="progress-track"><span :style="{ width: `${progress(activeSpace.id).percent}%` }"></span></div><details class="progress-explanation"><summary>查看计算与贡献明细</summary><p>同级节点使用相对权重，系统会按同级总和归一化。难度只作小幅修正；执行进度不等同于能力水平。</p><div class="progress-breakdown"><div v-if="progress(activeSpace.id).directPercent !== null"><strong>直属行动{{ progress(activeSpace.id).childPercent !== null ? ' · 默认占 60%' : '' }}</strong><span>当前完成 {{ progress(activeSpace.id).directPercent }}%</span><small v-for="task in activeSpaceTasks" :key="task.id">{{ task.done ? '已完成' : '待完成' }} · {{ task.title }}：相对权重 {{ task.weight }}，难度 {{ task.difficulty }}/5，占直属行动约 {{ directActionShare(task).toFixed(1) }}%</small></div><div v-if="progress(activeSpace.id).childPercent !== null"><strong>子方向{{ progress(activeSpace.id).directPercent !== null ? ' · 默认占 40%' : '' }}</strong><span>当前完成 {{ progress(activeSpace.id).childPercent }}%</span><small v-for="child in activeSpaceChildren" :key="child.id">{{ child.title }}：相对权重 {{ child.weight }} / 同级合计 {{ siblingWeightTotal(child) }}，归一化后约 {{ normalizedWeight(child).toFixed(1) }}%，当前分支 {{ progress(child.id).percent }}%</small></div></div></details></div><div class="detail-summary-side"><span>当前里程碑</span><strong>{{ activeSpace.milestone || '尚未设置' }}</strong><details class="progress-explanation"><summary>完成标准{{ activeSpace.definitionOfDone ? '' : ' · 待补充' }}</summary><p style="white-space: pre-wrap">{{ activeSpace.definitionOfDone || '可以先开始行动，再通过讨论逐步补充完成标准。' }}</p><button class="text-link" @click="newSpace(activeSpace.id)">调整完成标准</button></details></div></section>
            <section class="detail-section"><div class="section-heading"><div><span class="section-number">01 / 行动</span><h2>当前方向的行动 <span>{{ activeSpaceTasks.length }}</span></h2></div><button class="text-link" @click="newTask(activeSpace.id)"><Icon name="plus" :size="15" /> 安排行动</button></div><div v-if="activeSpaceTasks.length" class="panel detail-actions-list"><div v-for="task in activeSpaceTasks" :key="task.id" class="detail-action-row" :class="{ 'is-done': task.done }"><input :id="`detail-task-${task.id}`" v-model="task.done" type="checkbox" :aria-label="`完成：${task.title}`"><label :for="`detail-task-${task.id}`"><strong>{{ task.title }}</strong><span>{{ actionModeLabel(task.actionMode) }} · {{ taskStatusLabel(task.status) }} · {{ task.minutes ? minutesLabel(task.minutes) : '无时长估算' }} <em v-if="task.summary">已有工作记录</em></span></label><button class="text-link" :aria-label="`调整行动：${task.title}`" @click="editTask(task.id)">调整</button></div></div><div v-else class="panel detail-empty compact"><p>这个节点还没有直接行动。可以先添加一个最小可执行步骤。</p><button class="button secondary" @click="newTask(activeSpace.id)">添加第一个行动</button></div></section>
            <section class="detail-section"><div class="section-heading"><div><span class="section-number">02 / 子方向</span><h2>子方向 <span>{{ activeSpaceChildren.length }}</span></h2></div><button class="text-link" @click="newSpace(undefined, activeSpace.id)"><Icon name="plus" :size="15" /> 新建子方向</button></div><div v-if="activeSpaceChildren.length" class="detail-children-grid"><article v-for="child in activeSpaceChildren" :key="child.id" class="panel detail-child-card"><RouterLink :to="spaceRoute(child.id)" class="detail-child-link"><span class="space-icon" :class="child.color"><Icon :name="child.icon" :size="19" /></span><span><small>{{ spaceKindLabel(child.kind) }} · 相对权重 {{ child.weight }} · 同级占 {{ normalizedWeight(child).toFixed(1) }}%</small><strong>{{ child.title }}</strong><em>{{ progress(child.id).percent }}% · {{ progress(child.id).done }}/{{ progress(child.id).total }} 行动</em></span><Icon name="arrow" :size="17" /></RouterLink><div class="detail-child-actions"><button class="text-link" @click="newSpace(child.id)">调整</button><button class="text-link" @click="newTask(child.id)">安排行动</button></div></article></div><div v-else class="panel detail-empty"><p>需要分阶段或分主题时，再添加子方向。</p><button class="button secondary" @click="newSpace(undefined, activeSpace.id)">创建第一个子方向</button><RouterLink :to="{ path: '/planner/ai', query: { scope: activeSpace.id, intent: 'refine' } }" class="button primary">让 AI 细化分支</RouterLink></div></section>
<details v-if="activeSpaceTasks.length" class="detail-tool-section"><summary>行动状态与完成条件</summary><div class="detail-tool-body">          <section class="panel task-state-panel"><div class="section-heading"><div><span class="section-number">执行与证据</span><h2>行动状态 <span>{{ activeSpaceTasks.length }}</span></h2></div><span class="small muted">只有“已完成”计入执行进度</span></div><p v-if="!activeSpaceTasks.length" class="empty-state compact">创建行动后，可在这里记录过程状态和证据程度。</p><div v-for="task in activeSpaceTasks" :key="task.id" class="task-state-row"><strong>{{ task.title }}</strong><label>执行状态<select :aria-label="`${task.title}的执行状态`" v-model="task.status" @change="setTaskStatus(task, task.status)"><option v-for="option in taskStatuses" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label>证据状态<select :aria-label="`${task.title}的证据状态`" v-model="task.evidenceLevel"><option v-for="option in evidenceLevels" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><small>{{ task.status === 'done' ? `已计入执行进度 · ${evidenceLevelLabel(task.evidenceLevel)}` : `${taskStatusLabel(task.status)}不会计入执行进度 · ${evidenceLevelLabel(task.evidenceLevel)}` }}</small></div></section>
          <section class="panel task-mode-panel"><div class="section-heading"><div><span class="section-number">推进设计</span><h2>行动如何算完成</h2></div><span class="small muted">日期和时长都可留空</span></div><p v-if="!activeSpaceTasks.length" class="empty-state compact">创建行动后，可在这里决定它按什么方式推进。</p><div v-for="task in activeSpaceTasks" :key="task.id" class="task-mode-row"><strong>{{ task.title }}</strong><label>推进方式<select :aria-label="`${task.title}的推进方式`" v-model="task.actionMode"><option v-for="option in actionModes" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label>完成目标 / 条件<input :aria-label="`${task.title}的完成条件`" v-model="task.target" maxlength="500" :placeholder="actionModeHint(task.actionMode)"></label><small>{{ actionModeHint(task.actionMode) }} {{ task.target ? `当前：${task.target}` : '还未写目标或条件。' }}</small></div></section>
</div></details>
<details v-if="activeSpaceTasks.length" class="detail-tool-section"><summary>推进记录</summary><div class="detail-tool-body">          <section class="panel action-log-panel"><div class="section-heading"><div><span class="section-number">过程记录</span><h2>把推进留在行动里</h2></div><span class="small muted">记录不会自动完成行动</span></div><p v-if="!activeSpaceTasks.length" class="empty-state compact">创建行动后，可记录每次推进、结果、卡点和下一步。</p><article v-for="task in activeSpaceTasks" :key="task.id" class="action-log-row"><div class="action-log-title"><strong>{{ task.title }}</strong><small>{{ actionLogsFor(task.id).length }} 条记录</small></div><details><summary>新增一次推进记录</summary><form class="action-log-form" @submit.prevent="addActionLog(task.id)"><label>这次做了什么<textarea :aria-label="`${task.title}的本次推进`" v-model="actionLogDraft(task.id).note" required maxlength="6000" rows="3" placeholder="例如：读完方法部分，摘下三个可以复用的实验设计。"></textarea></label><div class="form-columns"><label>得到什么结果<input :aria-label="`${task.title}的本次结果`" v-model="actionLogDraft(task.id).result" maxlength="2000" placeholder="可留空"></label><label>卡点或不确定处<input :aria-label="`${task.title}的本次卡点`" v-model="actionLogDraft(task.id).blocker" maxlength="2000" placeholder="可留空"></label></div><label>下一步<input :aria-label="`${task.title}的下一步`" v-model="actionLogDraft(task.id).next" maxlength="2000" placeholder="可留空"></label><button class="button secondary compact" type="submit">保存本次记录</button></form></details><ol v-if="actionLogsFor(task.id).length" class="action-log-list"><li v-for="log in actionLogsFor(task.id).slice(0, 3)" :key="log.id"><time>{{ timeLabel(log.date) }}</time><p>{{ log.note }}</p><small v-if="log.result">结果：{{ log.result }}</small><small v-if="log.blocker">卡点：{{ log.blocker }}</small><small v-if="log.next">下一步：{{ log.next }}</small></li></ol></article></section>
</div></details>
<details v-if="activeSpaceTasks.length" class="detail-tool-section"><summary>关联学习资料</summary>
  <div class="detail-tool-body">
    <section class="panel task-evidence-panel">
      <div class="section-heading">
        <div><span class="section-number">资料关联</span><h2>把证据放到行动上</h2></div>
        <RouterLink :to="{ path: '/planner/materials', query: { library: activeSpace.id } }" class="text-link">管理资料库</RouterLink>
      </div>
      <p class="help-text">勾选已有资料，或导入文件到「{{ activeSpace.title }}」并关联到对应行动。</p>
      <label v-if="aiStatus.configured" class="library-check"><input v-model="autoGuide" type="checkbox" :disabled="busy">导入时用 AI 生成导读</label>
      <div v-for="task in activeSpaceTasks" :key="task.id" class="task-evidence-row" role="group" :aria-label="task.title">
        <div class="task-evidence-action">
          <strong>{{ task.title }}</strong>
          <FileImportButton :label="`为${task.title}选择资料文件`" :disabled="busy || directoryBusy" @change="registerFiles($event, task)">
            {{ importingTask === task.id ? '处理中…' : '导入并关联' }}
          </FileImportButton>
        </div>
        <div class="task-evidence-options">
          <label v-for="material in state.materials" :key="material.id" class="evidence-link-option"><input type="checkbox" :checked="task.materialIds.includes(material.id)" @change="toggleTaskMaterial(task, material.id, ($event.target as HTMLInputElement).checked)"><span>{{ material.name }}</span><small>{{ material.kind }} · {{ materialLibraryName(material.spaceId) }}</small></label>
        </div>
      </div>
    </section>
  </div></details>
<details class="detail-tool-section "><summary>目标验收与方向状态</summary><div class="detail-tool-body">            <NodeAssessment :ask-delete="askDelete" @deleted="previous => deleted('验收记录已删除。', previous)" :key="activeSpace.id" :space-id="activeSpace.id" /><section class="panel space-state-panel"><div><span class="section-number">节点状态</span><strong>{{ spaceStatusLabel(activeSpace.status) }}</strong><p>{{ activeSpace.status === 'active' ? '当前会作为正常推进中的节点保留在计划里。' : activeSpace.status === 'paused' ? '暂停表示暂时不投入，但保留原有结构和记录。' : activeSpace.status === 'backlog' ? '搁置表示未来可能处理，目前不作为近期重点。' : '已完成节点保留为历史成果，不会自动改变行动完成事实。' }}</p></div><label>调整状态<select :aria-label="`${activeSpace.title}的节点状态`" v-model="activeSpace.status"><option v-for="option in spaceStatuses" :key="option.value" :value="option.value">{{ option.label }}</option></select></label></section>
</div></details>
          </div>
          <div v-else class="empty-state"><h1>找不到这个方向</h1><RouterLink to="/planner" class="button primary">返回学习总览</RouterLink></div>
        </template>

        <template v-else-if="route.path === '/planner/materials'">
          <div class="page-heading"><div><div class="eyebrow">MATERIALS & EVIDENCE</div><h1>资料与证据</h1><p>把资料放进对应方向，也可以写一篇 Markdown 笔记。</p></div><button class="button primary" @click="newMaterial"><Icon name="plus" :size="17" /> 写 Markdown</button></div>
          <section class="panel library-toolbar"><div><label for="material-library">查看资料库</label><DirectionPicker id="material-library" v-model="materialLibrary" :options="materialLibraryOptions" /></div><div><label for="material-search">搜索资料</label><input id="material-search" v-model="materialSearch" type="search" placeholder="搜索标题或正文"></div><label v-if="materialLibrary && materialLibrary !== '*'" class="library-check"><input v-model="materialIncludeChildren" type="checkbox">包含子分支</label></section>
          <div class="library-tools">
            <button type="button" class="button secondary" aria-controls="library-import" :aria-expanded="visibleLibraryTool === 'import'" @click="toggleLibraryTool('import')"><Icon name="upload" :size="16" />导入资料</button>
            <button type="button" class="button secondary" aria-controls="library-questions" :aria-expanded="visibleLibraryTool === 'questions'" @click="toggleLibraryTool('questions')"><Icon name="book" :size="16" />问资料</button>
          </div>
          <div v-if="materialLocalStatus || visibleLibraryTool === 'import'" class="library-local"><span>{{ materialLocalStatus || (directory ? `资料会先保存在浏览器；勾选“同时写入目录”后，本次保存会同步到“${directory.name}”。${directoryWriteLabel}` : '尚未选择目录；写笔记时可同时下载 Markdown。') }}</span><button v-if="directory" class="text-link" :disabled="directoryBusy" @click="saveMaterialsLocally">重新写入工作区</button><RouterLink to="/settings" class="text-link">管理目录</RouterLink></div><p v-if="materialLocalError" class="form-error" role="alert">请保留浏览器内容，核对目录后重试。</p>
          <div v-show="visibleLibraryTool === 'import'" id="library-import" class="upload-area"><span class="upload-symbol"><Icon name="folder" :size="30" /></span><div><h2>导入学习资料</h2>
            <template v-if="materialLibrary === '*'"><label for="import-owner">导入位置</label><DirectionPicker id="import-owner" v-model="importOwner" :options="materialOwnerOptions" /></template>
            <p v-else>导入到 {{ materialLibraryName(uploadTarget) }}</p>
            <p>支持提取 Markdown、TXT、CSV、DOCX 和文字版 PDF 正文。图片与扫描件可保存原件。</p>
            <label class="library-check"><input :checked="autoGuide && aiStatus.configured" type="checkbox" :disabled="!aiStatus.configured" @change="autoGuide = ($event.target as HTMLInputElement).checked">导入时用 AI 生成导读</label>
            <small>{{ aiStatus.configured ? '最多抽取 24 段生成导读。同一正文已有导读时直接复用。' : '可先导入，再到设置配置 AI 接口补生成导读。' }}</small>
          </div><FileImportButton label="选择学习资料" :disabled="busy || directoryBusy" @change="registerFiles">{{ busy ? '处理中…' : '选择文件' }}</FileImportButton></div>
          <div v-show="visibleLibraryTool === 'questions'" id="library-questions">
          <label v-if="materialLibrary && materialLibrary !== '*'" class="library-check"><input v-model="questionGlobal" type="checkbox">问答同时参考总文件库</label>
          <MaterialQuestions :materials="questionMaterials" :scope="materialLibrary === '*' ? '全部资料库' : materialLibraryName(materialLibrary) + (materialLibrary ? '（含上级与行动关联资料）' : '')" />
          </div>
          <div class="section-heading"><h2>资料 <span>{{ filteredMaterials.length }}</span></h2><span class="small muted">最多 50 份 · 每篇正文最多 100,000 字符</span></div><div class="materials-grid"><article v-for="material in filteredMaterials" :key="material.id" class="panel material-card"><div class="card-top"><span class="space-icon sage"><Icon :name="material.kind === '自述' ? 'book' : 'file'" :size="22" /></span><span class="tiny-badge">{{ material.kind }}</span><span v-if="material.demo" class="demo-label">示例</span><span class="record-actions card-actions"><button class="text-link" :aria-label="`调整资料：${material.name}`" @click="editMaterial(material.id)">调整</button><button class="text-link danger" :aria-label="`删除资料：${material.name}`" @click="deleteMaterial(material.id)">删除</button></span></div><h3>{{ material.name }}</h3><p class="material-owner">{{ materialLibraryName(material.spaceId) }}</p><small v-if="material.referenceIds?.length">亦可在 {{ material.referenceIds.map(id => materialLibraryName(id)).join('、') }} 查阅</small>
            <MaterialGuide v-if="material.guide" :material="material" />
            <p v-else class="material-excerpt">{{ material.excerpt || material.extractionNote || (material.sourceHash ? '已保存原件，未提取到可检索文字。' : '仅有文件信息。') }}</p><button v-if="material.excerpt.trim() && !material.guide" class="text-link" :disabled="guideBusy.has(material.id) || !aiStatus.configured" @click="saveGuide(material.id)">{{ guideBusy.has(material.id) ? '生成导读中…' : '生成 AI 导读' }}</button>
            <small v-if="material.excerpt.trim() && !material.guide && !aiStatus.configured" class="guide-setup"><RouterLink to="/settings">配置 AI 接口</RouterLink>后可生成导读</small>
            <p v-if="guideErrors[material.id]" class="form-error" role="alert">{{ guideErrors[material.id] }}</p>
            <button v-if="material.sourceHash" class="text-link" @click="downloadOriginal(material)">下载原文件</button>
            <button class="text-link material-download" :aria-label="`下载 Markdown：${material.name}`" @click="downloadMaterial(material)">下载 Markdown</button><div class="material-meta"><span>{{ material.date.slice(0, 10) }}</span><span>{{ material.size ? bytesLabel(material.size) : '文字记录' }}</span></div><details v-if="material.excerpt"><summary>查看 Markdown 正文</summary><pre>{{ material.excerpt }}</pre></details></article></div><div v-if="!filteredMaterials.length" class="empty-state">{{ state.materials.length ? '没有匹配结果，尝试清除搜索或切换资料库。' : '还没有资料，先写一篇笔记或导入文件。' }}</div>
        </template>

        <template v-else-if="route.path === '/planner/reviews'">
          <div class="page-heading"><div><div class="eyebrow">REFLECT & GROW</div><h1>偶尔停下来，看看走过的路。</h1><p>记录执行情况，再带着证据讨论进步与下一步。</p></div><button class="button primary" @click="createReview"><Icon name="plus" :size="17" /> 生成执行小结</button></div>
          <div class="review-stats"><div class="panel"><Icon name="target" /><strong>{{ state.spaces.length }}</strong><span>探索中的方向</span></div><div class="panel"><Icon name="check" /><strong>{{ completed }}<small> / {{ state.tasks.length }}</small></strong><span>已完成的行动</span></div><div class="panel"><Icon name="folder" /><strong>{{ state.materials.length }}</strong><span>资料与自述</span></div></div><div class="notice"><Icon name="leaf" :size="18" /><p>这里的小结按本地记录整理。能力评估需要结合真实作品与多次证据，后续再接入 AI 讨论与多维评估。</p></div>
          <section class="panel evidence-summary-panel"><div><span class="section-number">能力与成果证据</span><h2>先看证据分布，不生成虚假的能力百分比。</h2><p>“已完成”表示执行记录；能力判断还要结合关联资料和重复表现。</p></div><div class="evidence-summary-counts"><span v-for="level in evidenceCounts" :key="level.value"><strong>{{ level.count }}</strong>{{ level.label }}</span></div><small>{{ activeProcessCount ? `另有 ${activeProcessCount} 个行动处于进行中、待验证或阻塞状态。` : '当前没有进行中、待验证或阻塞的行动。' }}</small></section>
          <div v-if="!state.reviews.length" class="panel review-empty"><span class="empty-icon"><Icon name="chart" :size="35" /></span><h2>第一份回顾，从此刻开始。</h2><p>整理已完成的行动、保留仍有疑问的地方。<br>成长的过程，值得被好好记录。</p><button class="button secondary" @click="createReview">生成我的第一份小结 <Icon name="arrow" :size="16" /></button></div><article v-for="review in [...state.reviews].reverse()" :key="review.id" class="panel review-card"><div class="section-heading"><h2>{{ review.title }}</h2><div class="record-actions"><button class="text-link" :aria-label="`调整回顾：${review.title}`" @click="editReview(review.id)">调整</button><button class="text-link danger" :aria-label="`删除回顾：${review.title}`" @click="deleteReview(review.id)">删除</button><button class="icon-button" :aria-label="`导出${review.title}`" @click="downloadFile(`edu-review-${review.id}.md`, review.body, 'text/markdown;charset=utf-8')"><Icon name="download" :size="18" /></button></div></div><span class="small muted">{{ timeLabel(review.date) }} · 本地执行记录</span><pre>{{ review.body }}</pre></article>
        </template>

        <template v-else-if="route.path === '/planner/ai'">
          <div class="page-heading"><div><div class="eyebrow">AI PLAN STUDIO</div><h1>把方向，细化成下一步。</h1><p>选择范围与目标，审阅具体调整，再决定是否采纳。</p></div><span class="offline-label" :class="{ unavailable: !aiStatus.configured }"><Icon name="spark" :size="17" /> {{ aiStatus.configured ? `已配置 · ${aiStatus.name} · ${aiStatus.model}` : 'AI 尚未配置' }}</span></div>
          <section class="panel ai-compose"><div class="ai-intents" role="group" aria-label="规划方式"><button v-for="intent in aiIntents" :key="intent.id" class="intent-button" :class="{ active: aiIntent === intent.id }" :aria-pressed="aiIntent === intent.id" :disabled="aiBusy" @click="aiIntent = intent.id">{{ intent.label }}</button></div><div class="ai-scope-row"><div><label for="ai-root">大方向</label><DirectionPicker id="ai-root" v-model="aiRoot" :disabled="aiBusy" :options="[{ value: '', label: '整个工作区', description: '包含全部大方向' }, ...directionOptions.filter(o => !o.depth)]" /><label v-if="aiRoot" for="ai-scope">子方向 / 跟进范围</label><DirectionPicker v-if="aiRoot" id="ai-scope" v-model="aiScope" :disabled="aiBusy" :options="[{ value: aiRoot, label: '整个大方向', description: '包含下级分支与行动' }, ...directionOptions.filter(o => aiBranchOptions.some(row => row.space.id === o.value))]" /></div><span class="help-text">当前范围：{{ aiScopeLabel }}。AI 只会整理这个节点及其下级计划和行动。</span></div><p class="help-text">AI 会读取节点类型、同层分量和难度。需要改变时会在提案中写明理由，你可以逐条采纳、再手工调整。</p><div class="ai-material-source"><label v-if="aiScope" class="library-check"><input v-model="aiIncludeGlobalMaterials" type="checkbox" :disabled="aiBusy">同时参考总文件库</label><details><summary>本轮将参考 {{ aiMaterialSelection.length }} 份资料</summary>
            <ul><li v-for="material in aiMaterialSelection" :key="material.id"><strong>{{ material.name }}</strong> · {{ materialLibraryName(material.spaceId) }}<pre class="planning-source-excerpt">{{ material.excerpt || '仅文件信息' }}</pre></li></ul>
            <p>{{ aiMaterialSelection.length ? '以上为本轮预算内的资料内容。修改问题或范围后会重新选取。' : '当前问题和范围内没有选中资料。' }}</p></details></div><label for="ai-request">你希望怎样调整？</label><textarea id="ai-request" v-model="aiPrompt" rows="3" maxlength="5000" placeholder="例如：先按能力拆出几个日语子方向，再给每个分支安排一个起步行动。每天约 30 分钟，不确定的地方标为暂定。"></textarea><ProposalBudget v-if="aiSources && aiPlan" :source="aiSources" :plan="aiPlan" /><div class="ai-compose-foot"><span>将使用“{{ qualityModes.find(m => m.id === preferences.mode)?.title }}”档上下文 · AI 不会直接修改数据</span><button class="button primary" :disabled="aiBusy || !aiPrompt.trim() || !aiStatus.configured || !aiPlan || aiPlan.blocked" @click="generateAiProposal"><Icon name="spark" :size="17" /> {{ aiBusy ? '正在整理…' : '生成调整提案' }}</button></div><p v-if="aiError" class="form-error" role="alert">{{ aiError }}</p><p v-if="!aiStatus.configured" class="help-text">请先到 `/settings` 添加并启用一个 AI 接口。密钥只用于本机请求，不会进入浏览器工作区。</p></section>
          <section v-if="aiProposal" class="panel proposal-panel"><div class="section-heading"><div><span class="section-number">REVIEW BEFORE APPLY</span><h2>AI 调整提案</h2></div><span class="tiny-badge">{{ selectedOperations.length }}/{{ aiProposal.operations.length }} 已选择</span></div><details class="proposal-summary" open><summary>本轮建议</summary><p>{{ readableText(aiProposal.summary) }}</p></details><div v-if="aiProposal.operations.length" class="proposal-list"><article v-for="operation in aiProposal.operations" :key="operation.id" class="proposal-row" :class="{ 'has-issue': aiIssues.has(operation.id) }">
<input v-model="selectedOperations" type="checkbox" :value="operation.id" :aria-label="`${actionLabel(operation)}${entityLabel(operation)}：${operationTitle(operation)}`">
<span class="proposal-kind" :class="operation.action">{{ actionLabel(operation) }}{{ entityLabel(operation) }}</span>
<div class="proposal-content"><strong>{{ operationTitle(operation) }}</strong><span class="proposal-owner">归属 · {{ proposalOwner(operation) }}</span><p>{{ readableText(operation.reason) }}</p>
<p v-if="aiIssues.has(operation.id)" class="form-error" role="alert">{{ aiIssues.get(operation.id) }}</p>
<details><summary>查看具体内容</summary><div class="proposal-body"><p v-if="operation.fields.description">{{ readableText(operation.fields.description) }}</p><p v-if="operation.fields.text">{{ readableText(operation.fields.text) }}</p><p v-if="operation.entity === 'space' && operation.fields.definitionOfDone != null" style="white-space: pre-wrap">完成标准：{{ readableText(operation.fields.definitionOfDone) || '清空现有标准' }}</p><p v-if="operation.fields.milestone">阶段目标：{{ readableText(operation.fields.milestone) }}</p><p v-if="operation.entity === 'task'">预计 {{ operation.fields.minutes || '保持原值' }} 分钟 · {{ operation.fields.date || '采纳当天' }}</p><p v-if="operation.entity === 'space'">类型 {{ proposalKindLabel(operation.fields.kind) }} · 分量 {{ operation.fields.weight || '保持原值' }} · 难度 {{ operation.fields.difficulty ? operation.fields.difficulty + '/5' : '保持原值' }}</p><p v-else-if="operation.entity === 'task'">分量 {{ operation.fields.weight || '保持原值' }} · 难度 {{ operation.fields.difficulty ? operation.fields.difficulty + '/5' : '保持原值' }}</p><p v-if="operation.action === 'delete'">这项操作将删除记录，请确认后采纳。</p></div></details></div></article></div><div v-else class="empty-state">本轮只提供建议，无需修改计划。</div><ProgressPreview v-if="selectedOperations.length" :before="state" :after="aiPreview.after" :error="aiPreview.error" /><div class="proposal-actions"><button class="button secondary" @click="aiProposal = undefined">放弃本次提案</button><button class="button primary" :disabled="!selectedOperations.length || aiIssues.size > 0" @click="applyAiProposal">采纳所选 {{ selectedOperations.length }} 项</button></div></section>
          <section class="ai-principles"><div><strong>可调整</strong><span>采纳后仍能手工编辑或删除</span></div><div><strong>可选择</strong><span>每条操作可以单独取消</span></div><div><strong>有边界</strong><span>完成事实不会由 AI 自动填写</span></div></section>
        </template>

        <template v-else-if="route.path === '/planner/sync'">
          <div class="page-heading"><div><div class="eyebrow">CONTINUE ANYWHERE</div><h1>换一个地方，思路也能接得上。</h1><p>先用轻量文件完成接续，再逐步实现本地与云端同步。</p></div><span class="offline-label"><Icon name="laptop" :size="17" /> 仅本地运行</span></div>
          <section class="panel context-panel"><div><span class="section-number">01 / CONTEXT</span><h2>把关键上下文，带进下一次讨论。</h2><p>选择需要的资料深度，导出 Markdown 接续包。可以交给本地 AI 会话，<br class="desktop-break">不用把整个历史反复放进每一次对话。</p><div class="inline-actions"><button class="button primary" @click="openModal('context')"><Icon name="book" :size="17" /> 预览讨论接续包</button><RouterLink to="/settings" class="text-link">调整资料深度 <Icon name="arrow" :size="15" /></RouterLink></div></div><div class="context-illustration" aria-hidden="true"><Icon name="file" :size="58" /><span>CONTEXT.md</span></div></section>
          <div class="sync-grid"><section class="panel sync-card"><span class="section-number">02 / LOCAL WORKSPACE</span><h2><Icon name="folder" :size="23" /> 目录工作区</h2><p>目标、行动、证据、草稿和回顾分别保存为 Markdown。索引记录当前有效内容，关系表描述行动属于哪个目标，不依赖设备编号。</p><div class="sync-facts"><span>当前结构化数据</span><strong>{{ bytesLabel(dataSize) }}</strong><span>目录状态</span><strong>{{ directory ? directory.name : '尚未选择' }}</strong></div><div class="inline-actions"><RouterLink to="/settings" class="button primary"><Icon name="settings" :size="16" /> 管理工作区目录</RouterLink></div><p class="small muted">目录内的 `_index.tsv` 是提交边界；未列入索引的旧文件不会参与读取，方便以后做历史清理和差异同步。</p></section><section class="panel sync-card cloud-card"><span class="section-number">03 / NEXT CHAPTER</span><h2><Icon name="cloud" :size="23" /> 云端同步</h2><span class="coming-badge">尚未接入</span><p>下一阶段按单条记录的内容哈希上传变化，并对目标关系做冲突检查。当前没有数据发送到服务器。</p><div class="cloud-flow"><span><Icon name="folder" />目录</span><span class="dashed-path"></span><span><Icon name="cloud" />云端</span></div><span class="small muted">来源是记录和关系，不把整份工作区当作一个 JSON 覆盖。</span></section></div>
        </template>

        <SettingsView v-else-if="route.path === '/settings'" :directory="directory" :directory-busy="directoryBusy" :directory-supported="directorySupported" :directory-support-message="directorySupportMessage" :directory-write-label="directoryWriteLabel" :quality-modes="qualityModes" :ask-delete="askDelete" @notice="tell" @open-modal="openModal" @bind="bindDirectory" @save="saveToDirectory" @read="readFromDirectory" @unbind="unbindDirectory" />
        <div v-else class="empty-state"><h1>这页还没有内容</h1><RouterLink to="/planner" class="button primary">返回学习总览</RouterLink></div>
        <footer class="workspace-footer"><span>知序 · 把成长留在日常里</span><span><span class="status-dot"></span> 数据保存在当前浏览器 · 云端未接入</span></footer>
      </main>
    </div>
  </div>
  <DeleteConfirmation ref="confirmation" />
  <Transition name="toast"><div v-if="toast" class="toast-message" role="status"><Icon name="check" :size="18" /><span>{{ toast }}</span><button v-if="undoId && history[0]?.id === undoId" class="toast-undo" @click="undoDeletion">撤销删除</button><button aria-label="关闭通知" class="icon-button" @click="toast = ''"><Icon name="close" :size="16" /></button></div></Transition>
  <dialog ref="dialog" class="modal" :class="{ 'wide-modal': modal === 'context' }" aria-labelledby="modal-title" @close="modal = ''" @click="($event.target === dialog) && closeModal()"><div class="modal-heading"><h2 id="modal-title">{{ dialogTitle }}</h2><button class="icon-button" aria-label="关闭对话框" @click="closeModal"><Icon name="close" /></button></div>
    <StarterPlan v-if="modal === 'starter'" :start-with-template="Boolean(rootSpaces.length)" @cancel="closeModal" @created="id => { closeModal(); router.push(spaceRoute(id)); }" />
    <ValidatedForm v-else-if="modal === 'task'" class="modal-form" @valid="addTask"><p class="help-text">行动可以按日期推进，也可以按成果、次数、触发条件或习惯循环推进。时间只是可选估算。{{ applyingDraft ? '这是从草稿提取的行动，请检查并调整标题。' : '' }}</p><label for="task-title">行动内容</label><input id="task-title" v-model="taskTitle" required maxlength="200" placeholder="例如：读完一篇文献并整理三个问题" autofocus><label for="task-space">所属计划或分支</label><DirectionPicker id="task-space" v-model="taskSpace" label="所属方向" :options="directionOptions" /><div class="form-columns"><div><label for="task-mode">推进方式</label><select id="task-mode" v-model="taskActionMode"><option v-for="option in actionModes" :key="option.value" :value="option.value">{{ option.label }}</option></select></div><div><label for="task-target">完成目标 / 条件（可留空）</label><input id="task-target" v-model="taskTarget" maxlength="500" :placeholder="actionModeHint(taskActionMode)"></div></div><p class="help-text">{{ actionModeHint(taskActionMode) }} 目标可随时改；是否完成仍由你确认。</p><div class="form-columns"><div><label for="task-date">计划日期（可留空）</label><input id="task-date" v-model="taskDate" type="date"></div><div><label for="task-minutes">预计投入（分钟，可留空）</label><input id="task-minutes" v-model="taskMinutes" type="number" min="0" max="1440"></div></div><details class="planning-settings" :open="taskPlanningOpen" @toggle="taskPlanningOpen = ($event.target as HTMLDetailsElement).open"><summary>规划设置 <span>分量与难度</span></summary><p class="help-text">分量用于比较同一计划下行动的重要性；难度反映完成门槛。它们会影响进度评估，也会提供给 AI 作为规划依据。</p><div class="form-columns"><div><label for="task-weight">行动分量（1-100）</label><input id="task-weight" v-model="taskWeight" type="number" min="1" max="100" required></div><div><label for="task-difficulty">行动难度</label><select id="task-difficulty" v-model="taskDifficulty"><option :value="1">1 · 基础</option><option :value="2">2 · 熟悉</option><option :value="3">3 · 有挑战</option><option :value="4">4 · 较难</option><option :value="5">5 · 关键突破</option></select></div></div></details><ProgressPreview v-if="editingTask || taskPlanningOpen" :before="state" :after="manualPreview.after" :error="manualPreview.error" /><details class="optional-form-section" :open="Boolean(editingTask)"><summary>工作记录与文件（选填）</summary><div class="optional-form-body"><label for="task-summary">完成证据 / 工作记录</label><textarea id="task-summary" v-model="taskSummary" rows="6" maxlength="12000" placeholder="可写完成标准、期望产出、触发条件、次数或完成结果。例如：写出一页提纲；收集三条可引用证据；收到导师反馈后记录决定。"></textarea><div class="inline-actions"><button type="button" class="button secondary" @click="taskSummaryInput?.click()"><Icon name="upload" :size="15" /> 导入总结文件</button><span class="help-text">支持 Markdown、TXT；最多读取 12,000 字符</span><input ref="taskSummaryInput" class="sr-only" type="file" accept=".md,.txt,text/plain" @change="importTaskSummary"></div></div></details><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button v-if="editingTask" type="button" class="button danger-button push-left" @click="deleteTask(editingTask)">删除行动</button><button type="button" class="button secondary" @click="closeModal">取消</button><button class="button primary" type="submit">{{ editingTask ? '保存调整' : '加入计划' }} <Icon name="arrow" :size="16" /></button></div></ValidatedForm>
    <ValidatedForm v-else-if="modal === 'space'" class="modal-form" @valid="saveSpace"><label for="space-title">节点名称</label><input id="space-title" aria-label="方向名称" v-model="spaceTitle" required maxlength="120" placeholder="例如：研究生阶段的学习与研究" autofocus><div><label for="space-parent">上级方向 / 计划</label><DirectionPicker id="space-parent" v-model="spaceParentId" :options="parentOptions" /></div><details class="planning-settings" :open="spacePlanningOpen" @toggle="spacePlanningOpen = ($event.target as HTMLDetailsElement).open"><summary>规划设置 <span>类型、分量与难度</span></summary><p class="help-text">类型决定这个节点在结构中的用途；分量只和同级节点比较；难度用于表达完成门槛。三项都可以随时手工修改，也会作为 AI 规划的依据。</p><div class="form-columns"><div><label for="space-kind">节点类型</label><select id="space-kind" v-model="spaceKind"><option value="direction">方向 · 长期主题</option><option value="plan">计划 · 持续安排</option><option value="stage">阶段 · 按时段推进</option><option value="project">项目 · 有明确成果</option><option value="branch">分支 · 待继续发散</option></select></div><div><label for="space-weight">在上级中的分量（1-100）</label><input id="space-weight" v-model="spaceWeight" type="number" min="1" max="100" required></div></div><div><label for="space-difficulty">节点难度</label><select id="space-difficulty" v-model="spaceDifficulty"><option :value="1">1 · 基础</option><option :value="2">2 · 熟悉</option><option :value="3">3 · 有挑战</option><option :value="4">4 · 较难</option><option :value="5">5 · 关键突破</option></select></div><div class="form-columns"><div><label for="space-category">分类标签</label><select id="space-category" v-model="spaceCategory"><option>长期方向</option><option>研究项目</option><option>阶段学习</option><option>习惯养成</option><option>论文工作</option><option>考试准备</option></select></div><div><label for="space-color">卡片颜色</label><select id="space-color" v-model="spaceColor"><option value="sage">鼠尾草绿</option><option value="sand">暖砂色</option><option value="lavender">浅紫灰</option></select></div></div></details><ProgressPreview v-if="editingSpace || spacePlanningOpen" :before="state" :after="manualPreview.after" :error="manualPreview.error" /><label for="space-description">这个节点要解决什么</label><textarea id="space-description" aria-label="为什么想做这件事" v-model="spaceDescription" rows="3" maxlength="500" placeholder="先写一个大致的想法，之后可以随时调整。"></textarea><details class="optional-form-section" :open="Boolean(editingSpace)"><summary>阶段目标与完成标准（选填）</summary><div class="optional-form-body"><label for="space-milestone">当前阶段 / 下一个里程碑</label><input id="space-milestone" v-model="spaceMilestone" maxlength="500" placeholder="例如：完成领域入门阅读"><label for="space-done">完成标准（可留空）</label><textarea id="space-done" v-model="spaceDefinitionOfDone" rows="3" maxlength="2000" placeholder="例如：能独立解释三篇文献的方法差异，并整理一份有引用的比较笔记。"></textarea><p class="help-text">写下可检查的成果或表现，之后可以随讨论调整。留空也可以开始行动。</p></div></details><div v-if="editingSpace" class="space-actions-preview"><strong>这个节点的行动与下级节点</strong><p v-for="task in state.tasks.filter(t => spaceTaskIds(editingSpace).has(t.spaceId))" :key="task.id">{{ task.done ? '✓' : '○' }} {{ task.title }} <span>{{ task.date }}</span></p><p v-if="!state.tasks.some(t => spaceTaskIds(editingSpace).has(t.spaceId))" class="muted">还没有行动，可以在目标树中为这个节点安排行动。</p></div><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button v-if="editingSpace" type="button" class="button danger-button push-left" @click="deleteSpace(editingSpace)">{{ spaceParentId ? '删除节点' : '删除方向' }}</button><button type="button" class="button secondary" @click="closeModal">取消</button><button class="button primary" type="submit">{{ editingSpace ? '保存调整' : spaceParentId ? '创建子方向' : '创建大方向' }}</button></div></ValidatedForm>
    <ValidatedForm v-else-if="modal === 'material'" class="modal-form" @valid="addMaterial"><label for="material-title">记录标题</label><input id="material-title" v-model="materialTitle" required maxlength="200" placeholder="例如：这周论文阅读的收获" autofocus><label for="material-space">所属资料库</label><DirectionPicker id="material-space" v-model="materialSpace" :options="materialOwnerOptions" /><details><summary>在其他方向引用这份资料</summary><div class="material-references"><label v-for="option in directionOptions.filter(o => o.value !== materialSpace)" :key="option.value" class="library-check"><input v-model="materialReferences" type="checkbox" :value="option.value">{{ option.description === '大方向' ? option.label : option.description + ' / ' + option.label }}</label></div></details><label for="material-kind">记录类型</label><select id="material-kind" v-model="materialKind"><option>自述</option><option>个人成果</option><option>阅读笔记</option><option>待验证想法</option><option>文本摘录</option><option>文件信息</option></select><label for="material-text">内容</label><textarea id="material-text" v-model="materialText" rows="12" maxlength="100000" class="markdown-editor" placeholder="# 本次学习\n\n## 收获\n- 写下结论、例子或练习结果…"></textarea><div class="material-editor-foot"><span>{{ materialText.length.toLocaleString() }} / 100,000 字符 · Markdown</span><label class="library-check"><input v-model="materialSaveLocal" type="checkbox">{{ directory ? '同时写入目录' : '同时下载 .md 文件' }}</label></div><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button type="button" class="button secondary" @click="closeModal">取消</button><button class="button primary" type="submit" :disabled="directoryBusy">保存记录</button></div></ValidatedForm>
    <ValidatedForm v-else-if="modal === 'draftEdit'" class="modal-form" @valid="saveDraftEdit"><label for="draft-edit-space">草稿所属方向</label><DirectionPicker id="draft-edit-space" v-model="draftEditSpace" :options="[{ value: '', label: '工作区通用' }, ...directionOptions]" /><label for="draft-edit-text">草稿内容</label><textarea id="draft-edit-text" v-model="draftEditText" required rows="7" maxlength="3000" autofocus></textarea><div class="modal-actions"><button type="button" class="button secondary" @click="closeModal">取消</button><button class="button primary" type="submit">保存草稿</button></div></ValidatedForm>
    <ValidatedForm v-else-if="modal === 'reviewEdit'" class="modal-form" @valid="saveReviewEdit"><label for="review-title">回顾标题</label><input id="review-title" v-model="reviewTitle" required maxlength="160" autofocus><label for="review-body">回顾内容</label><textarea id="review-body" v-model="reviewBody" required rows="12" maxlength="6000"></textarea><div class="modal-actions"><button type="button" class="button secondary" @click="closeModal">取消</button><button class="button primary" type="submit">保存回顾</button></div></ValidatedForm>
    <div v-else-if="modal === 'import' && pendingImport" class="modal-body"><p>即将用所选目录的工作区<strong>替换浏览器中的当前内容</strong>。目录绑定本身保持不变。</p><div class="import-preview"><span>{{ pendingImport.spaces.length }} 个方向</span><span>{{ pendingImport.tasks.length }} 个行动</span><span>{{ pendingImport.actionLogs.length }} 条推进记录</span><span>{{ pendingImport.materials.length }} 份证据</span><span>{{ pendingImport.drafts.length }} 条草稿</span><span>{{ pendingImport.reviews.length }} 份回顾</span></div><div v-if="pendingDirectoryChanges.length" class="directory-changes"><strong>发现 {{ pendingDirectoryChanges.length }} 个目录文件在上次写入后有修改</strong><span v-for="path in pendingDirectoryChanges.slice(0, 8)" :key="path">{{ path }}</span><small v-if="pendingDirectoryChanges.length > 8">另有 {{ pendingDirectoryChanges.length - 8 }} 个文件</small></div><p class="help-text">修改过的文件已按结构解析并通过格式校验。确认后读入；取消则不会改变浏览器中的内容。</p><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button class="button secondary" @click="closeModal">取消</button><button class="button primary" @click="applyImport">确认读取并替换</button></div></div>
    <div v-else-if="modal === 'reset'" class="modal-body"><p>将浏览器中的方向、行动、资料、草稿和小结替换为初始示例。已选目录及其中的文件不受影响。</p><p class="help-text">如需保留当前内容，请先关闭对话框并写入目录。</p><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button class="button secondary" @click="closeModal">取消</button><button class="button danger-button" @click="confirmReset">确认恢复示例</button></div></div>
    <div v-else-if="modal === 'clear'" class="modal-body"><p>将清空当前浏览器中的方向、行动、资料、草稿和小结，回到空白工作区。</p><p class="help-text">已选目录及其中的文件不会被删除或改动；如需保留浏览器内容，请先写入目录。</p><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button class="button secondary" @click="closeModal">取消</button><button class="button danger-button" @click="confirmClear">确认清空工作区</button></div></div>
    <div v-else-if="modal === 'context'" class="modal-body"><p class="help-text">{{ qualityModes.find(m => m.id === preferences.mode)?.title }}档 · {{ contextText.length.toLocaleString() }} 字符（不是精确 token 数）。这是规则筛选的资料包，未调用 AI 进行语义压缩。</p><pre class="context-preview">{{ contextText }}</pre><div class="modal-actions"><button class="button secondary" @click="closeModal(); router.push('/settings')">调整资料深度</button><button class="button primary" @click="exportContext"><Icon name="download" :size="16" /> 下载 Markdown</button></div></div>
    <form v-else-if="modal === 'schedule'" class="modal-form schedule-modal-form" @submit.prevent="saveSchedule"><p class="help-text">普通日程用于安排一段时间；重要日和节假日可以设为全天。节假日只做标记，不会自动改变行动完成状态。</p><label for="schedule-title">名称</label><input id="schedule-title" v-model="scheduleTitle" required maxlength="200" placeholder="例如：导师组会、纪念日、国庆节" autofocus><div class="form-columns"><label for="schedule-date">日期<input id="schedule-date" v-model="scheduleEntryDate" type="date" required></label><label for="schedule-type">类型<select id="schedule-type" v-model="scheduleType"><option v-for="option in scheduleTypes" :key="option.value" :value="option.value">{{ option.label }}</option></select></label></div><p class="help-text">{{ scheduleTypes.find(option => option.value === scheduleType)?.hint }}</p><div class="form-columns"><label for="schedule-category">分类<select id="schedule-category" v-model="scheduleCategory"><option v-for="option in scheduleCategories" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label class="schedule-all-day-label"><span>时间范围</span><span><input v-model="scheduleAllDay" type="checkbox"> 全天安排{{ scheduleType === 'holiday' ? '（节假日自动按全天保存）' : '' }}</span></label></div><div v-if="!scheduleAllDay && scheduleType !== 'holiday'" class="form-columns"><label for="schedule-start">开始<input id="schedule-start" v-model="scheduleStart" type="time"></label><label for="schedule-end">结束<input id="schedule-end" v-model="scheduleEnd" type="time"></label></div><label for="schedule-space">关联方向（可留空）</label><DirectionPicker id="schedule-space" v-model="scheduleSpace" label="关联方向" :options="[{ value: '', label: '不关联方向', description: '作为个人日程保留' }, ...directionOptions]" /><label for="schedule-task">关联行动（可留空）</label><select id="schedule-task" v-model="scheduleTask"><option value="">不关联行动</option><option v-for="task in scheduleTaskOptions" :key="task.id" :value="task.id">{{ task.title }} · {{ spaceName(task.spaceId) }}</option></select><label for="schedule-note">备注（可留空）</label><textarea id="schedule-note" v-model="scheduleNote" rows="4" maxlength="2000" placeholder="写下地点、准备事项，或为什么要保留这个重要日。"></textarea><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button v-if="editingSchedule" type="button" class="button danger-button push-left" @click="deleteSchedule(editingSchedule)">删除日程</button><button type="button" class="button secondary" @click="closeModal">取消</button><button class="button primary" type="submit">{{ editingSchedule ? '保存调整' : '加入日程' }} <Icon name="arrow" :size="16" /></button></div></form>
    <form v-else-if="modal === 'scheduleSettings'" class="modal-form schedule-settings-modal" @submit.prevent="saveScheduleSettings"><p class="help-text">把每天相对稳定的时间先放进预算里，再安排具体日程。你可以改名、切换按时间段 / 按分钟预算，也可以新增自己的安排；取消不会保存本次修改。</p><div class="schedule-settings-list"><div v-for="(row, index) in scheduleBaselineDraftRows" :key="row.id" class="schedule-settings-row"><div class="schedule-settings-row-heading"><input v-model="row.title" :aria-label="`时间安排名称 ${index + 1}`" maxlength="80" required><label class="schedule-baseline-enabled"><input v-model="row.enabled" type="checkbox">启用</label><button type="button" class="text-link danger" :aria-label="`删除时间安排 ${row.title || index + 1}`" @click="removeScheduleBaseline(row.id)">删除</button></div><div class="form-columns"><label>类型<select v-model="row.type"><option v-for="option in scheduleBaselineTypes" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label>计算方式<select v-model="row.mode"><option value="time">按时间段</option><option value="minutes">按分钟预算</option></select></label></div><label v-if="row.type === 'work'" class="schedule-workday-option"><span><input v-model="row.workdaysOnly" type="checkbox">仅工作日计入工作时间</span><small>周末、节假日不计入，调休补班日计入。取消勾选则每天计入。节假日以已同步数据和手动标记为准；未同步时按周一至周五计算。</small></label><div v-if="row.mode === 'time'" class="form-columns"><label :for="`baseline-start-${row.id}`">开始<input :id="`baseline-start-${row.id}`" v-model="row.start" type="time" required></label><label :for="`baseline-end-${row.id}`">结束<input :id="`baseline-end-${row.id}`" v-model="row.end" type="time" required></label></div><label v-else :for="`baseline-minutes-${row.id}`">每天预算分钟<input :id="`baseline-minutes-${row.id}`" v-model.number="row.minutes" type="number" min="0" max="1440" required></label></div></div><button type="button" class="add-row schedule-add-baseline" @click="addScheduleBaseline"><Icon name="plus" :size="15" /> 新增时间安排</button><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="modal-actions"><button type="button" class="button secondary" @click="closeModal">取消</button><button class="button primary" type="submit">保存时间基线 <Icon name="arrow" :size="16" /></button></div></form>
  </dialog>
</template>
