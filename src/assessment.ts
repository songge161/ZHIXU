export type AssessmentOutcome = 'met' | 'partial' | 'not_yet';
export interface Assessment {
  criteria: string;
  outcome: AssessmentOutcome;
  reason: string;
  gaps: string;
  evidence: Array<{ id: string; name: string }>;
}
export const assessmentLabel = (outcome: AssessmentOutcome) => ({ met: '已达标', partial: '部分达标', not_yet: '尚未达标' }[outcome]);

export function validateAssessment(value: unknown): Assessment | undefined {
  if (value === undefined) return undefined;
  const fail = (): never => { throw new Error('验收记录格式无效。'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const a = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max ? v : fail();
  const criteria = text(a.criteria, 2000), reason = text(a.reason, 1000), gaps = text(a.gaps, 1000);
  if (!criteria.trim() || !reason.trim() || !['met', 'partial', 'not_yet'].includes(String(a.outcome))) return fail();
  if (!Array.isArray(a.evidence) || a.evidence.length > 10) return fail();
  const ids = new Set<string>();
  const evidence = a.evidence.map(row => {
    if (!row || typeof row !== 'object') return fail();
    const id = text(row.id, 100), name = text(row.name, 200);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) return fail();
    ids.add(id); return { id, name };
  });
  if (a.outcome === 'met' && !evidence.length) return fail();
  return { criteria, reason, gaps, outcome: a.outcome as AssessmentOutcome, evidence };
}

export function assessmentBody(a: Assessment): string {
  return [`验收结论：${assessmentLabel(a.outcome)}（用户自评）`, `当时的完成标准：\n${a.criteria}`, `判断依据：\n${a.reason}`, `关联证据：\n${a.evidence.map(row => `- ${row.name}`).join('\n') || '未关联'}`, `不足与下一步：\n${a.gaps || '未填写'}`, '这是一份按当时标准保存的自评记录，不自动改变行动完成情况或证明能力。标准或资料改变后应重新核对。'].join('\n\n');
}
