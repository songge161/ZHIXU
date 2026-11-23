import type { Workspace } from './state';
import type { ProposalOperation } from './ai';

// Check the final parent graph, including new nodes referenced by temporary IDs.
export function proposalIssues(workspace: Workspace, rows: ProposalOperation[], scopeId: string): Map<string, string> {
  const issues = new Map<string, string>();
  const parents = new Map(workspace.spaces.map(s => [s.id, s.parentId]));
  const originalParents = new Map(parents);
  const inside = (id: string, graph: Map<string, string>) => {
    const seen = new Set<string>();
    while (id && !seen.has(id)) { if (id === scopeId) return true; seen.add(id); id = graph.get(id) || ''; }
    return false;
  };
  const lists = { space: workspace.spaces, task: workspace.tasks, draft: workspace.drafts, material: workspace.materials, review: workspace.reviews };
  const created = new Set<string>();
  const deleted = new Set(rows.filter(r => r.action === 'delete').map(r => r.targetId));
  for (const row of rows) {
    if (row.action === 'create') {
      if (created.has(row.targetId) || Object.values(lists).some(list => list.some(v => v.id === row.targetId))) issues.set(row.id, '新记录的临时 ID 重复，请重新生成提案。');
      created.add(row.targetId);
    } else if (!lists[row.entity].some(v => v.id === row.targetId)) issues.set(row.id, '引用的记录不存在，请重新生成提案。');
    if (row.entity === 'space') {
      if (row.action === 'delete') parents.delete(row.targetId);
      else if (row.action === 'create' || row.fields.parentId) parents.set(row.targetId, row.fields.parentId);
    }
  }
  for (const row of rows) {
    if (issues.has(row.id)) continue;
    const existing = lists[row.entity].find(v => v.id === row.targetId);
    const oldOwner = row.entity === 'space' ? row.targetId : existing && 'spaceId' in existing ? existing.spaceId || '' : '';
    const owner = row.entity === 'space' ? row.fields.parentId || (row.action === 'create' ? '' : originalParents.get(row.targetId) || '') : row.fields.spaceId || oldOwner || (row.action === 'create' ? scopeId : '');
    if (scopeId && !originalParents.has(scopeId)) { issues.set(row.id, '所选方向已不存在，请重新选择范围。'); continue; }
    if (scopeId && row.action !== 'create' && !inside(oldOwner, originalParents)) { issues.set(row.id, '这条记录不属于当前方向，需切换范围后单独调整。'); continue; }
    if (row.action === 'delete') continue;
    if ((row.entity === 'task' || owner) && (!parents.has(owner) || deleted.has(owner))) { issues.set(row.id, '所属方向不存在或未选中。请同时勾选新建父分支，或取消删除父分支。'); continue; }
    if (scopeId && !(row.entity === 'space' && row.targetId === scopeId && owner === originalParents.get(scopeId)) && !inside(owner, parents)) { issues.set(row.id, '目标归属超出当前方向，不能移到其他方向或新建顶层方向。'); continue; }
    if (row.entity === 'space') {
      let current = owner; const seen = new Set([row.targetId]);
      while (current) { if (seen.has(current)) { issues.set(row.id, '分支不能放入自己或自己的下级。'); break; } seen.add(current); current = parents.get(current) || ''; }
    }
  }
  return issues;
}
