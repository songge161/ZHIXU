import type { Workspace } from './state';
import type { ProposalOperation } from './ai';

export function recordTitle(workspace: Workspace, operation: ProposalOperation): string {
  const id = operation.targetId;
  switch (operation.entity) {
    case 'space': return workspace.spaces.find(row => row.id === id)?.title || '';
    case 'task': return workspace.tasks.find(row => row.id === id)?.title || '';
    case 'material': return workspace.materials.find(row => row.id === id)?.name || '';
    case 'draft': return workspace.drafts.find(row => row.id === id)?.text.slice(0, 60) || '';
    case 'review': return workspace.reviews.find(row => row.id === id)?.title || '';
  }
}

// Display-only replacement: never change IDs used to apply a proposal.
// Short references are resolved only when the prefix uniquely identifies a record.
export function readableReferences(text: string, workspace: Workspace, operations: ProposalOperation[] = []): string {
  const records = new Map<string, string>([
    ...workspace.spaces.map(row => [row.id, row.title] as [string, string]),
    ...workspace.tasks.map(row => [row.id, row.title] as [string, string]),
    ...workspace.materials.map(row => [row.id, row.name] as [string, string]),
    ...workspace.drafts.map(row => [row.id, row.text.slice(0, 40)] as [string, string]),
    ...workspace.reviews.map(row => [row.id, row.title] as [string, string]),
  ]);
  for (const row of operations) if (row.action === 'create' && row.fields.title) records.set(row.targetId, row.fields.title);
  const aliases = new Map<string, string>();
  for (const [id, title] of records) {
    if (id.length < 8 || !title || !/^[\w-]+$/.test(id)) continue;
    aliases.set(id, title);
    const prefix = id.slice(0, 8);
    if (/^[a-f\d]{8}$/i.test(prefix) && [...records.keys()].filter(key => key.startsWith(prefix)).length === 1) aliases.set(prefix, title);
  }
  if (!aliases.size) return text;
  const pattern = [...aliases.keys()].sort((a, b) => b.length - a.length).map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return text.replace(new RegExp(`(?<![\\w-])(?:${pattern})(?![\\w-])`, 'g'), id => `「${aliases.get(id)}」`);
}
