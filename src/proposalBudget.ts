import type { AiProtocol } from './ai';
import type { Mode, Workspace } from './state';
import { byteLength, inputBytes, modelRequest } from './modelRequest';

export const recordLabels = { spaces: '方向', tasks: '行动', actionLogs: '推进记录', materials: '资料', drafts: '草稿', reviews: '回顾', schedule: '日程' } as const;
export type RecordGroup = keyof typeof recordLabels;

function stageSummary(source: Workspace, scope: string) {
  const logs = [...source.actionLogs].sort((a, b) => b.date.localeCompare(a.date));
  const titles = new Map(source.tasks.map(task => [task.id, task.title]));
  const excerpt = (text: string) => text.length > 120 ? text.slice(0, 120) + '…' : text;
  const done = source.tasks.filter(t => t.done);
  const weight = (tasks: typeof done) => tasks.reduce((sum, t) => sum + t.weight * (1 + (t.difficulty - 1) * 0.15), 0);
  const earlierMonths = new Map<string, { count: number; latest: Workspace['actionLogs'][number] }>();
  for (const log of logs.slice(3)) {
    const month = /^\d{4}-\d{2}/.exec(log.date)?.[0] || '日期未注明';
    const period = earlierMonths.get(month);
    if (period) period.count++;
    else earlierMonths.set(month, { count: 1, latest: log });
  }
  return [
    'AI 范围：' + scope,
    '阶段摘要（根据当前记录生成）',
    `范围内有 ${source.spaces.length} 个节点、${source.tasks.length} 个行动，已完成 ${done.length} 个，阻塞 ${source.tasks.filter(t => t.status === 'blocked').length} 个。`,
    `当前分量校准：已完成行动分量 ${weight(done).toFixed(1)}，总分量 ${weight(source.tasks).toFixed(1)}。`,
    `共有 ${logs.length} 条推进记录。下列近期摘录来自用户记录。`,
    ...logs.slice(0, 3).map(log => [
      `${log.date} · ${titles.get(log.taskId)} [${log.id}]`, excerpt(log.result || log.note),
      log.blocker && '当时的卡点：' + excerpt(log.blocker), log.next && '当时的下一步：' + excerpt(log.next),
    ].filter(Boolean).join(' · ')),
    ...Array.from(earlierMonths).slice(0, 3).map(([month, { count, latest }]) =>
      `较早记录 · ${month} 共 ${count} 条，最近一条：${titles.get(latest.taskId)} · ${excerpt(latest.result || latest.note)} [${latest.id}]`),
    ...(earlierMonths.size > 3 ? [`另有 ${earlierMonths.size - 3} 个月份的历史未展开。`] : []),
    '结构化明细按预算选取。未展开的记录可能包含其他证据。上级和总文件库仅供参考。',
  ].join('\n');
}

// Records appear as JSON inside the upstream user-message string. Count both escaping layers.
function embeddedBytes(value: unknown) {
  return byteLength(JSON.stringify(JSON.stringify(value))) - 2;
}

export function prepareProposal(source: Workspace, candidates: Workspace, scope: string, request: string, mode: Mode, protocol: AiProtocol, model: string) {
  const limit = inputBytes[mode];
  const context = stageSummary(source, scope);
  const workspace: Workspace = {
    spaces: source.spaces, tasks: candidates.tasks.map(t => ({ ...t, summary: '' })),
    actionLogs: [], drafts: [], reviews: [], materials: [], schedule: [],
    scheduleSettings: { ...source.scheduleSettings, calendarHolidays: [] },
  };
  const measure = () => byteLength(JSON.stringify(modelRequest(protocol, model, request, context, workspace)));
  let used = measure();
  function reserve(bytes: number) {
    if (used + bytes > limit) return false;
    used += bytes;
    return true;
  }
  function append<T>(target: T[], rows: T[]) {
    for (const row of rows) {
      if (reserve(embeddedBytes(row) + (target.length ? 1 : 0))) target.push(row);
    }
  }

  append(workspace.materials, candidates.materials);
  append(workspace.reviews, [...candidates.reviews].reverse());
  append(workspace.actionLogs, [...candidates.actionLogs].reverse());
  append(workspace.drafts, [...candidates.drafts].reverse());
  const tasks = new Map(workspace.tasks.map(t => [t.id, t]));
  for (const task of candidates.tasks) {
    if (task.summary && reserve(embeddedBytes(task.summary) - embeddedBytes(''))) tasks.get(task.id)!.summary = task.summary;
  }
  append(workspace.schedule, candidates.schedule);
  append(workspace.scheduleSettings.calendarHolidays, candidates.scheduleSettings.calendarHolidays);
  const bytes = measure();
  return { request, context, workspace, mode, bytes, limit, blocked: bytes > limit };
}
export type ProposalPreview = ReturnType<typeof prepareProposal>;
