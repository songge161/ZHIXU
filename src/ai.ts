import { computed, reactive, ref, watch } from 'vue';
import type { Mode, Workspace } from './state';

export type ProposalEntity = 'space' | 'task' | 'material' | 'draft' | 'review';
export type ProposalAction = 'create' | 'update' | 'delete';
export interface ProposalFields {
  title: string;
  text: string;
  category: string;
  description: string;
  milestone: string;
  definitionOfDone?: string | null;
  color: string;
  parentId: string;
  spaceId: string;
  minutes: number;
  weight: number;
  difficulty: number;
  status: string;
  spaceStatus: string;
  evidenceLevel: string;
  actionMode: string;
  target: string;
  date: string;
  kind: string;
}
export interface ProposalOperation {
  id: string;
  action: ProposalAction;
  entity: ProposalEntity;
  targetId: string;
  reason: string;
  fields: ProposalFields;
}
export interface AiProposal { summary: string; operations: ProposalOperation[] }

export type AiProtocol = 'responses' | 'chat_completions';
export interface AiConnection {
  id: string;
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

const CONNECTIONS_KEY = 'edu.prototype.v1.ai.connections';
const ACTIVE_CONNECTION_KEY = 'edu.prototype.v1.ai.active';
const readConnections = (): AiConnection[] => {
  try {
    const value = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((row): row is AiConnection => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.name === 'string' && (row.protocol === 'responses' || row.protocol === 'chat_completions') && typeof row.baseUrl === 'string' && typeof row.model === 'string' && typeof row.apiKey === 'string' && typeof row.enabled === 'boolean');
  } catch { return []; }
};
const storedActive = (() => { try { return localStorage.getItem(ACTIVE_CONNECTION_KEY) || ''; } catch { return ''; } })();
export const aiConnections = reactive<AiConnection[]>(readConnections());
export const activeAiConnectionId = ref(storedActive && aiConnections.some(row => row.id === storedActive) ? storedActive : '');
export const activeAiConnection = computed(() => aiConnections.find(row => row.id === activeAiConnectionId.value && row.enabled));
watch(aiConnections, value => { try { localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(value)); } catch { /* settings remain usable for this session */ } }, { deep: true });
watch(activeAiConnectionId, value => { try { localStorage.setItem(ACTIVE_CONNECTION_KEY, value); } catch { /* settings remain usable for this session */ } });
export const connectionReady = (connection?: AiConnection) => Boolean(connection?.enabled && connection.name.trim() && connection.baseUrl.trim() && connection.model.trim());

const actions = new Set<ProposalAction>(['create', 'update', 'delete']);
const entities = new Set<ProposalEntity>(['space', 'task', 'material', 'draft', 'review']);
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';

export function validateProposal(input: unknown): AiProposal {
  if (!input || typeof input !== 'object') throw new Error('AI 返回的提案格式无效。');
  const root = input as Record<string, unknown>;
  if (!Array.isArray(root.operations) || root.operations.length > 30) throw new Error('AI 提案操作数量无效。');
  const ids = new Set<string>();
  const operations = root.operations.map((value, index): ProposalOperation => {
    if (!value || typeof value !== 'object') throw new Error('AI 提案包含无效操作。');
    const row = value as Record<string, unknown>;
    const action = row.action as ProposalAction;
    const entity = row.entity as ProposalEntity;
    const fields = row.fields && typeof row.fields === 'object' ? row.fields as Record<string, unknown> : {};
    const id = text(row.id, 80) || `operation-${index + 1}`;
    if (!actions.has(action) || !entities.has(entity) || ids.has(id)) throw new Error('AI 提案包含未知或重复操作。');
    ids.add(id);
    const operation: ProposalOperation = {
      id, action, entity, targetId: text(row.targetId, 100), reason: text(row.reason, 500),
      fields: {
        title: text(fields.title, 200), text: text(fields.text, 12000), category: text(fields.category, 40),
        description: text(fields.description, 500), milestone: text(fields.milestone, 500), definitionOfDone: typeof fields.definitionOfDone === 'string' ? text(fields.definitionOfDone, 2000) : null,
        color: ['sage', 'sand', 'lavender'].includes(String(fields.color)) ? String(fields.color) : action === 'update' ? '' : 'sage',
        parentId: text(fields.parentId, 100),
        spaceId: text(fields.spaceId, 100), minutes: typeof fields.minutes === 'number' && Number.isFinite(fields.minutes) ? Math.max(0, Math.min(1440, Math.round(fields.minutes))) : 0,
        weight: typeof fields.weight === 'number' && Number.isFinite(fields.weight) ? Math.max(1, Math.min(100, Math.round(fields.weight))) : action === 'update' ? 0 : 1,
        difficulty: typeof fields.difficulty === 'number' && Number.isFinite(fields.difficulty) ? Math.max(1, Math.min(5, Math.round(fields.difficulty))) : action === 'update' ? 0 : 1,
        status: ['todo', 'in_progress', 'pending_verification', 'done', 'blocked', 'adjusted'].includes(String(fields.status)) ? String(fields.status) : action === 'create' && entity === 'task' ? 'todo' : '',
        spaceStatus: ['active', 'paused', 'backlog', 'completed'].includes(String(fields.spaceStatus)) ? String(fields.spaceStatus) : action === 'create' && entity === 'space' ? 'active' : '',
        evidenceLevel: ['none', 'recorded', 'independent', 'stable'].includes(String(fields.evidenceLevel)) ? String(fields.evidenceLevel) : action === 'create' && entity === 'task' ? 'none' : '',
        actionMode: ['scheduled', 'deliverable', 'count', 'trigger', 'habit'].includes(String(fields.actionMode)) ? String(fields.actionMode) : action === 'create' && entity === 'task' ? 'deliverable' : '',
        target: text(fields.target, 500),
        date: text(fields.date, 40), kind: text(fields.kind, 30),
      },
    };
    if (!operation.targetId) throw new Error('AI 提案缺少记录身份。');
    if (action === 'create' && entity === 'space' && !operation.fields.title) throw new Error('AI 提案中的新方向缺少标题。');
    if (action === 'create' && entity === 'task' && (!operation.fields.title || !operation.fields.spaceId)) throw new Error('AI 提案中的新行动缺少标题或所属方向。');
    if (action === 'create' && entity === 'material' && !operation.fields.title) throw new Error('AI 提案中的新资料缺少标题。');
    if (action === 'create' && entity === 'draft' && !operation.fields.text) throw new Error('AI 提案中的新草稿缺少内容。');
    if (action === 'create' && entity === 'review' && !operation.fields.title) throw new Error('AI 提案中的新回顾缺少标题。');
    return operation;
  });
  return { summary: text(root.summary, 2000), operations };
}

export async function requestAiProposal(request: string, context: string, workspace: Workspace, connection?: AiConnection, mode: Mode = 'standard'): Promise<AiProposal> {
  if (!connectionReady(connection)) throw new Error('请先在设置中选择一个已启用且填写完整的 AI 接口。');
  const response = await fetch('/api/edu/ai/proposal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, context, workspace, connection, mode }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error || `AI 请求失败（${response.status}）`);
  return validateProposal(payload.data);
}
