import type { Workspace, Space, Task } from './state';

export const actionImpact = (task: Task) => task.weight * (1 + (task.difficulty - 1) * 0.15);
export function relativeShare(workspace: Pick<Workspace, 'spaces' | 'tasks'>, row: Space | Task): number {
  if ('parentId' in row) {
    const sum = workspace.spaces.filter(item => item.parentId === row.parentId).reduce((sum, item) => sum + item.weight, 0);
    return sum ? row.weight / sum * 100 : 0;
  }
  const sum = workspace.tasks.filter(item => item.spaceId === row.spaceId).reduce((sum, item) => sum + actionImpact(item), 0);
  return sum ? actionImpact(row) / sum * 100 : 0;
}

export interface ProgressChange { id: string; title: string; kind: string; before: string; after: string; from: string; to: string }
export function progressChanges(before: Workspace, after: Workspace): ProgressChange[] {
  const previous = calculateProgress(before), next = calculateProgress(after);
  const changes: ProgressChange[] = [];
  const owner = (workspace: Workspace, id: string) => workspace.spaces.find(row => row.id === id)?.title || (id ? '原节点已移除' : '大方向');
  for (const id of new Set([...before.spaces.map(row => row.id), ...after.spaces.map(row => row.id)])) {
    const a = before.spaces.find(row => row.id === id), b = after.spaces.find(row => row.id === id);
    const old = previous.get(id), current = next.get(id);
    if (a && b && old?.percent === current?.percent && old?.done === current?.done && old?.total === current?.total && a.parentId === b.parentId && Math.abs(relativeShare(before, a) - relativeShare(after, b)) < 0.001) continue;
    const label = (workspace: Workspace, row?: Space, value?: { percent: number; done: number; total: number }) => row && value ? `进度 ${value.percent}% · ${value.done}/${value.total} 行动 · 同级占 ${relativeShare(workspace, row).toFixed(1)}%` : '不存在';
    changes.push({ id: `space:${id}`, title: b?.title || a!.title, kind: '节点', before: label(before, a, old), after: label(after, b, current), from: a ? owner(before, a.parentId) : '新增', to: b ? owner(after, b.parentId) : '删除' });
  }
  for (const id of new Set([...before.tasks.map(row => row.id), ...after.tasks.map(row => row.id)])) {
    const a = before.tasks.find(row => row.id === id), b = after.tasks.find(row => row.id === id);
    if (a && b && a.done === b.done && a.spaceId === b.spaceId && Math.abs(relativeShare(before, a) - relativeShare(after, b)) < 0.001) continue;
    const label = (workspace: Workspace, row?: Task) => row ? `${row.done ? '已完成' : '待完成'} · 直属行动占 ${relativeShare(workspace, row).toFixed(1)}%` : '不存在';
    changes.push({ id: `task:${id}`, title: b?.title || a!.title, kind: '行动', before: label(before, a), after: label(after, b), from: a ? owner(before, a.spaceId) : '新增', to: b ? owner(after, b.spaceId) : '删除' });
  }
  return changes;
}
const nodeExponent = (space: Space) => ({ direction: 1.22, plan: 1.15, stage: 1.08, project: 1.04, branch: 1 }[space.kind] + (space.difficulty - 1) * 0.03);

// Used by both the live workspace and adjustment previews.
export function calculateProgress(workspace: Pick<Workspace, 'spaces' | 'tasks'>) {
  type Aggregate = { total: number; done: number; raw: number; direct: number | null; children: number | null };
  const cache = new Map<string, Aggregate>();
  const calculate = (id: string, stack = new Set<string>()): Aggregate => {
    if (cache.has(id)) return cache.get(id)!;
    if (stack.has(id)) return { total: 0, done: 0, raw: 0, direct: null, children: null };
    const nextStack = new Set(stack).add(id);
    const directTasks = workspace.tasks.filter(task => task.spaceId === id);
    const directWeight = directTasks.reduce((sum, task) => sum + actionImpact(task), 0);
    const direct = directWeight ? directTasks.reduce((sum, task) => sum + (task.done ? actionImpact(task) : 0), 0) / directWeight : null;
    const childRows = workspace.spaces.filter(space => space.parentId === id).map(child => ({ child, value: calculate(child.id, nextStack) }));
    const childWeight = childRows.reduce((sum, row) => sum + row.child.weight, 0);
    const children = childWeight ? childRows.reduce((sum, row) => sum + row.child.weight * row.value.raw, 0) / childWeight : null;
    const raw = direct !== null && children !== null ? direct * 0.6 + children * 0.4 : direct ?? children ?? 0;
    const value = { total: directTasks.length + childRows.reduce((sum, row) => sum + row.value.total, 0), done: directTasks.filter(task => task.done).length + childRows.reduce((sum, row) => sum + row.value.done, 0), raw, direct, children };
    cache.set(id, value); return value;
  };
  workspace.spaces.forEach(space => calculate(space.id));
  return new Map([...cache].map(([id, value]) => {
    const space = workspace.spaces.find(item => item.id === id)!;
    const percent = value.raw ? Math.round(Math.pow(value.raw, nodeExponent(space)) * 100) : 0;
    return [id, { ...value, percent, rawPercent: Math.round(value.raw * 100), directPercent: value.direct === null ? null : Math.round(value.direct * 100), childPercent: value.children === null ? null : Math.round(value.children * 100) }];
  }));
}
