import { validateWorkspace, uuid, type Workspace, type SpaceKind, type SpaceStatus, type TaskStatus, type EvidenceLevel, type ActionMode } from './state';
import type { ProposalOperation } from './ai';
import { proposalIssues } from './proposalScope';

export function previewIdFactory(workspace: Workspace): () => string {
  const used = new Set([...workspace.spaces, ...workspace.tasks, ...workspace.materials, ...workspace.drafts, ...workspace.reviews, ...workspace.actionLogs, ...workspace.schedule].map(row => row.id));
  let serial = 0;
  return () => { let id: string; do { id = `preview_${++serial}`; } while (used.has(id)); used.add(id); return id; };
}

// Pure workspace transformation: never writes storage or mutates the source.
export function proposalWorkspace(workspace: Workspace, chosen: ProposalOperation[], scopeId: string, newId: () => string = uuid): Workspace {
  const issues = proposalIssues(workspace, chosen, scopeId);
  if (issues.size) throw new Error([...issues.values()][0]);
    const next = JSON.parse(JSON.stringify(workspace)) as Workspace;
    const newIds = new Map<string, string>();
    for (const row of chosen.filter(row => row.action === 'create')) newIds.set(row.targetId, newId());
    const idOf = (value: string) => newIds.get(value) || value;
    for (const row of chosen) {
      const id = idOf(row.targetId); const f = row.fields;
      if (row.action === 'delete') {
        if (row.entity === 'space') { next.spaces = next.spaces.filter(v => v.id !== id); next.tasks = next.tasks.filter(v => v.spaceId !== id); next.actionLogs = next.actionLogs.filter(log => next.tasks.some(task => task.id === log.taskId)); }
        if (row.entity === 'task') { next.tasks = next.tasks.filter(v => v.id !== id); next.actionLogs = next.actionLogs.filter(log => log.taskId !== id); }
        if (row.entity === 'material') { next.materials = next.materials.filter(v => v.id !== id); next.tasks.forEach(task => { task.materialIds = task.materialIds.filter(materialId => materialId !== id); }); }
        if (row.entity === 'draft') next.drafts = next.drafts.filter(v => v.id !== id);
        if (row.entity === 'review') { if (next.reviews.find(v => v.id === id)?.assessment) throw new Error('验收记录由你在方向详情中删除。'); next.reviews = next.reviews.filter(v => v.id !== id); }
        continue;
      }
      if (row.action === 'create') {
        if (row.entity === 'space') next.spaces.push({ id, parentId: idOf(f.parentId || ''), kind: (['direction', 'plan', 'stage', 'project', 'branch'].includes(f.kind) ? f.kind : 'plan') as SpaceKind, status: (['active', 'paused', 'backlog', 'completed'].includes(f.spaceStatus) ? f.spaceStatus : 'active') as SpaceStatus, title: f.title, category: f.category || '阶段学习', description: f.description, color: f.color, icon: 'target', milestone: f.milestone, definitionOfDone: f.definitionOfDone ?? '', weight: f.weight, difficulty: f.difficulty });
        if (row.entity === 'task') { const status = (['todo', 'in_progress', 'pending_verification', 'done', 'blocked', 'adjusted'].includes(f.status) ? f.status : 'todo') as TaskStatus; const actionMode = (['scheduled', 'deliverable', 'count', 'trigger', 'habit'].includes(f.actionMode) ? f.actionMode : 'deliverable') as ActionMode; next.tasks.push({ id, spaceId: idOf(f.spaceId), title: f.title, summary: f.text, done: status === 'done', status, evidenceLevel: (['none', 'recorded', 'independent', 'stable'].includes(f.evidenceLevel) ? f.evidenceLevel : 'none') as EvidenceLevel, materialIds: [], actionMode, target: f.target, minutes: f.minutes, date: f.date, weight: f.weight, difficulty: f.difficulty }); }
        if (row.entity === 'material') next.materials.push({ spaceId: idOf(f.spaceId || scopeId), id, name: f.title, kind: f.kind || '待验证想法', size: 0, date: new Date().toISOString(), excerpt: f.text, demo: false });
        if (row.entity === 'draft') next.drafts.push({ spaceId: idOf(f.spaceId || scopeId), id, text: f.text, date: new Date().toISOString(), applied: false });
        if (row.entity === 'review') next.reviews.push({ spaceId: idOf(f.spaceId || scopeId), id, title: f.title, date: new Date().toISOString(), body: f.text });
        continue;
      }
      if (row.entity === 'space') { const value = next.spaces.find(v => v.id === id); if (value) Object.assign(value, { parentId: f.parentId ? idOf(f.parentId) : value.parentId, kind: (['direction', 'plan', 'stage', 'project', 'branch'].includes(f.kind) ? f.kind : value.kind) as SpaceKind, status: (['active', 'paused', 'backlog', 'completed'].includes(f.spaceStatus) ? f.spaceStatus : value.status) as SpaceStatus, title: f.title || value.title, category: f.category || value.category, description: f.description || value.description, milestone: f.milestone || value.milestone, definitionOfDone: f.definitionOfDone ?? value.definitionOfDone, color: f.color || value.color, weight: f.weight || value.weight, difficulty: f.difficulty || value.difficulty }); }
      if (row.entity === 'task') { const value = next.tasks.find(v => v.id === id); if (value) { const status = ['todo', 'in_progress', 'pending_verification', 'done', 'blocked', 'adjusted'].includes(f.status) ? f.status as TaskStatus : value.status; const actionMode = ['scheduled', 'deliverable', 'count', 'trigger', 'habit'].includes(f.actionMode) ? f.actionMode as ActionMode : value.actionMode; Object.assign(value, { title: f.title || value.title, spaceId: f.spaceId ? idOf(f.spaceId) : value.spaceId, summary: f.text || value.summary, actionMode, target: f.target || value.target, minutes: f.minutes || value.minutes, date: f.date || value.date, weight: f.weight || value.weight, difficulty: f.difficulty || value.difficulty, status, done: status === 'done', evidenceLevel: ['none', 'recorded', 'independent', 'stable'].includes(f.evidenceLevel) ? f.evidenceLevel as EvidenceLevel : value.evidenceLevel }); } }
      if (row.entity === 'material') { const value = next.materials.find(v => v.id === id); if (value && f.spaceId) value.spaceId = idOf(f.spaceId); if (value && f.text && f.text !== value.excerpt) delete value.guide; if (value) Object.assign(value, { name: f.title || value.name, kind: f.kind || value.kind, excerpt: f.text || value.excerpt, demo: false }); }
      if (row.entity === 'draft') { const value = next.drafts.find(v => v.id === id); if (value && f.spaceId) value.spaceId = idOf(f.spaceId); if (value && f.text) value.text = f.text; }
      if (row.entity === 'review') { const value = next.reviews.find(v => v.id === id); if (value?.assessment) throw new Error('验收记录由你在方向详情中调整。AI 可以新增建议回顾。'); if (value && f.spaceId) value.spaceId = idOf(f.spaceId); if (value) Object.assign(value, { title: f.title || value.title, body: f.text || value.body }); }
    }
    const deletedSpaces = new Set(workspace.spaces.filter(row => !next.spaces.some(current => current.id === row.id)).map(row => row.id));
    const deletedTasks = new Set(workspace.tasks.filter(row => !next.tasks.some(current => current.id === row.id)).map(row => row.id));
    next.schedule = next.schedule.filter(entry => entry.taskId ? !deletedTasks.has(entry.taskId) : !deletedSpaces.has(entry.spaceId));
    next.schedule.forEach(entry => { const task = next.tasks.find(row => row.id === entry.taskId); if (task) entry.spaceId = task.spaceId; });
    return validateWorkspace(next);
}
