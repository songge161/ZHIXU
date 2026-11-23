import type { Workspace } from './state';

const tables = ['spaces', 'tasks', 'actionLogs', 'materials', 'drafts', 'reviews', 'schedule', 'scheduleSettings'] as const;
type Table = typeof tables[number];
export const tableLabels: Record<Table, string> = {
  spaces: '方向', tasks: '行动', actionLogs: '推进记录', materials: '资料', drafts: '草稿', reviews: '回顾', schedule: '日程', scheduleSettings: '时间设置',
};
export interface Change {
  table: Table;
  id: string;
  name: string;
  index: number;
  before: string | null;
  after: string | null;
}
export interface HistoryEntry { id: string; at: string; label: string; changes: Change[] }
export const historyLimit = 20;
export const historyBytes = 512 * 1024;

function rows(workspace: Workspace, table: Table) {
  if (table === 'scheduleSettings') return [{ id: table, ...workspace.scheduleSettings }];
  return workspace[table];
}

export function workspaceChanges(before: Workspace, after: Workspace): Change[] {
  const changes: Change[] = [];
  for (const table of tables) {
    const oldRows = new Map(rows(before, table).map((row, index) => [row.id, { row, index }]));
    const newRows = new Map(rows(after, table).map(row => [row.id, row]));
    for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const old = oldRows.get(id);
      const next = newRows.get(id);
      const previous = JSON.stringify(old?.row ?? null);
      const current = JSON.stringify(next ?? null);
      if (previous === current) continue;
      const row = next ?? old!.row;
      const name = 'title' in row ? row.title : 'name' in row ? row.name : 'text' in row ? row.text : 'note' in row ? row.note : tableLabels[table];
      changes.push({ table, id, name: name.slice(0, 100), index: old?.index ?? -1, before: old ? previous : null, after: next ? current : null });
    }
  }
  return changes;
}

export function readHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value) || value.length > historyLimit || size(value) > historyBytes) return [];
  const valid = value.every(entry => entry && typeof entry.id === 'string' && typeof entry.label === 'string' &&
    typeof entry.at === 'string' && Array.isArray(entry.changes) && entry.changes.length &&
    entry.changes.every((c: Change) => c && tables.includes(c.table) && typeof c.id === 'string' &&
      typeof c.name === 'string' && Number.isInteger(c.index) && [c.before, c.after].every(v => v === null || typeof v === 'string')));
  return valid ? value : [];
}

const size = (value: unknown) => new Blob([JSON.stringify(value)]).size;
export function appendHistory(entries: HistoryEntry[], entry: HistoryEntry) {
  const bounded = [entry, ...entries].slice(0, historyLimit);
  while (bounded.length && size(bounded) > historyBytes) bounded.pop();
  return bounded;
}

export function reverseChanges(current: Workspace, entry: HistoryEntry): Workspace {
  const result = structuredClone(current);
  for (const table of tables) {
    const changes = entry.changes.filter(c => c.table === table);
    if (!changes.length) continue;
    const records = rows(current, table);
    const byId = new Map(records.map(row => [row.id, row]));
    for (const c of changes) {
      const row = byId.get(c.id);
      if ((row ? JSON.stringify(row) : null) !== c.after) throw new Error('关联记录已变化，无法撤销这次调整。');
      byId.delete(c.id);
    }
    const restored = [...byId.values()];
    for (const c of changes.sort((a, b) => a.index - b.index)) {
      if (c.before !== null) restored.splice(c.index, 0, JSON.parse(c.before));
    }
    if (table === 'scheduleSettings') {
      const { id, ...settings } = restored[0];
      Object.assign(result, { scheduleSettings: settings });
    } else Object.assign(result, { [table]: restored });
  }
  return result;
}
