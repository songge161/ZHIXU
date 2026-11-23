import type { Material } from './state';

export interface Guide {
  summary: string;
  pointers: { part: number; topic: string }[];
}
export function readGuide(input: unknown): Guide | undefined {
  if (!input || typeof input !== 'object') return;
  const { summary, pointers } = input as Partial<Guide>;
  if (typeof summary !== 'string' || !summary.trim() || !Array.isArray(pointers)) return;
  return { summary: summary.trim().slice(0, 400), pointers: pointers.filter(p => p && Number.isInteger(p.part) && p.part > 0 && typeof p.topic === 'string').slice(0, 24).map(p => ({ part: p.part, topic: p.topic.slice(0, 120) })) };
}

type Part = { part: number; location: string; text: string };
const cache = new WeakMap<Material, { source: string; parts: Part[] }>();
export function materialParts(material: Material): Part[] {
  const source = material.excerpt;
  const cached = cache.get(material);
  if (cached?.source === source) return cached.parts;
  const parts: Part[] = [];
  let heading = '', buffer = '', first = 1;
  function flush() {
    if (buffer.trim()) parts.push({ part: parts.length + 1, location: [heading, '第 ' + first + ' 行'].filter(Boolean).join(' · '), text: buffer.trim() });
    buffer = '';
  }
  source.split(/\r?\n/).forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) { flush(); heading = line.replace(/^#+\s+/, '').slice(0, 90); }
    if (line.length + buffer.length > 800) flush();
    if (!buffer) first = index + 1;
    buffer += line + '\n';
    while (buffer.length > 800) {
      const rest = buffer.slice(800); buffer = buffer.slice(0, 800); flush(); buffer = rest;
    }
  });
  flush(); cache.set(material, { source, parts }); return parts;
}

function terms(value: string) {
  const groups = value.toLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(groups.flatMap(group => {
    if (!/\p{Script=Han}/u.test(group) || group.length === 1) return [group];
    return Array.from({ length: group.length - 1 }, (_, i) => group.slice(i, i + 2));
  }))];
}
function matchScore(value: string, words: string[]) {
  const lower = value.toLowerCase();
  return words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
}

export function findPassages(materials: Material[], question: string, limit = 3) {
  return rankedPassages(materials, terms(question.trim()), limit);
}

function rankedPassages(materials: Material[], words: string[], limit: number, matchFilename = true) {
  if (!words.length) return [];
  const score = (value: string) => matchScore(value, words);
  const hits = materials.flatMap(material => {
    const nameScore = matchFilename ? score(material.name) : 0;
    const topics = new Map<number, string>();
    for (const p of material.guide?.pointers || []) topics.set(p.part, (topics.get(p.part) || '') + ' ' + p.topic);
    return materialParts(material).map(p => ({ ...p, material, score: 2 * score(p.text) + score(p.location) + 2 * score(topics.get(p.part) || '') + 0.5 * nameScore }));
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  const selected: typeof hits = [], seen = new Set<string>();
  for (const hit of hits) {
    if (hit.score < hits[0].score * 0.45) break;
    if (seen.has(hit.text)) continue;
    seen.add(hit.text); selected.push(hit);
    if (selected.length === limit) break;
  }
  return selected;
}

// Preserve the matching region when a long passage exceeds its share of the budget.
function excerptWindow(text: string, words: string[], size: number) {
  if (text.length <= size) return text;
  let best = 0, bestScore = -1;
  const width = size - 2, last = text.length - width;
  for (let start = 0; ; start = Math.min(last, start + Math.max(1, Math.floor(width / 2)))) {
    const score = matchScore(text.slice(start, start + width), words);
    if (score > bestScore) { best = start; bestScore = score; }
    if (start === last) break;
  }
  return (best ? '…' : '') + text.slice(best, best + width) + (best < last ? '…' : '');
}

export function planningMaterials(materials: Material[], question: string, count: number, limit: number): Material[] {
  const words = terms(question.trim());
  const hits = rankedPassages(materials, words, 3, false);
  const selected = new Map<Material, string>();
  for (const material of new Set(hits.map(hit => hit.material))) {
    const parts = hits.filter(hit => hit.material === material);
    const share = Math.floor((limit - parts.length + 1) / parts.length);
    const excerpts = parts.map(hit => {
      const label = `原文片段 ${hit.part} · ${hit.location}\n`;
      return label + excerptWindow(hit.text, words, share - label.length);
    });
    selected.set(material, excerpts.join('\n'));
  }
  // A guide can match the user's vocabulary even when that vocabulary is absent from the source.
  const guides = materials.filter(m => !selected.has(m)).map(material => ({
    material, score: matchScore(material.name, words) + matchScore(material.guide?.summary || '', words),
  })).sort((a, b) => b.score - a.score);
  const matched = hits.length > 0 || guides.some(row => row.score > 0);
  for (const { material, score } of guides) {
    if (selected.size >= count) break;
    if (matched && !score) break;
    const summary = material.guide?.summary;
    if (words.length && !summary && !score) continue;
    let excerpt = summary ? 'AI 导读 · ' + summary : material.excerpt;
    if (words.length && !summary) {
      const first = materialParts(material)[0];
      excerpt = first ? `文件开头 · ${first.location}\n${first.text}` : '';
    }
    selected.set(material, excerpt.slice(0, limit));
  }
  return [...selected].map(([material, excerpt]) => ({
    id: material.id, spaceId: material.spaceId, name: material.name, kind: material.kind,
    size: material.size, date: material.date, demo: material.demo, excerpt,
  }));
}

// Spread the one-time guide budget over the document, including its final section.
export function guideSamples(material: Material) {
  const parts = materialParts(material), count = Math.min(parts.length, 24);
  return Array.from({ length: count }, (_, i) => {
    const part = parts[Math.round(i * (parts.length - 1) / Math.max(1, count - 1))];
    return { ...part, text: part.text.slice(0, Math.floor(9600 / count)) };
  });
}
