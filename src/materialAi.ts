import { activeAiConnection, connectionReady } from './ai';
import { guideSamples, readGuide, type Guide } from './materialSearch';
import { state, type Material } from './state';

export async function askMaterialModel(mode: 'guide' | 'answer', passages: object[], question?: string) {
  const connection = activeAiConnection.value;
  if (!connectionReady(connection)) throw new Error('请在设置中启用 AI 接口。');
  const response = await fetch('/api/edu/ai/' + mode, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection, passages, question }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '模型请求失败，请重试。');
  return json.data as unknown;
}

const pending = new Map<string, Promise<Guide>>();
export async function generateGuide(id: string) {
  const record = state.materials.find(m => m.id === id);
  if (!record?.excerpt.trim() || record.guide) return;
  const source = record.excerpt;
  const cached = state.materials.find(m => m.excerpt === source && m.guide)?.guide;
  async function analyze(material: Material) {
    const samples = guideSamples(material);
    const guide = readGuide(await askMaterialModel('guide', samples));
    if (!guide) throw new Error('AI 导读格式无效，请重试。');
    const anchors = new Set(samples.map(p => p.part));
    guide.pointers = guide.pointers.filter(p => anchors.has(p.part));
    return guide;
  }
  let guide = cached;
  if (!guide) {
    if (!pending.has(source)) pending.set(source, analyze(record).finally(() => pending.delete(source)));
    guide = await pending.get(source)!;
  }
  const current = state.materials.find(m => m.id === id);
  if (current?.excerpt === source) current.guide = guide;
}
