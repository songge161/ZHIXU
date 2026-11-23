<script setup lang="ts">
import { computed, ref } from 'vue';
import { history, state, uuid, timeLabel, type Review } from '../state';
import { assessmentBody, assessmentLabel, validateAssessment, type AssessmentOutcome } from '../assessment';

const props = defineProps<{ spaceId: string; askDelete: (question: string) => Promise<boolean> }>();
const emit = defineEmits<{ deleted: [previous?: string] }>();
const node = computed(() => state.spaces.find(row => row.id === props.spaceId));
const records = computed(() => state.reviews.filter(row => row.spaceId === props.spaceId && row.assessment).slice().reverse());
const editing = ref(false), editingId = ref(''), criteria = ref(''), reason = ref(''), gaps = ref(''), error = ref('');
const outcome = ref<AssessmentOutcome>('partial');
const selected = ref<string[]>([]);
const available = computed(() => {
  const ids = new Set([props.spaceId]);
  let changed = true;
  while (changed) { changed = false; state.spaces.forEach(row => { if (ids.has(row.parentId) && !ids.has(row.id)) { ids.add(row.id); changed = true; } }); }
  const linked = new Set(state.tasks.filter(row => ids.has(row.spaceId)).flatMap(row => row.materialIds));
  let parent = node.value?.parentId;
  while (parent && !ids.has(parent)) { ids.add(parent); parent = state.spaces.find(row => row.id === parent)?.parentId; }
  return state.materials.filter(row => !row.spaceId || ids.has(row.spaceId) || linked.has(row.id) || selected.value.includes(row.id));
});
const missing = computed(() => selected.value.filter(id => !state.materials.some(row => row.id === id)));
function open(record?: Review) {
  editingId.value = record?.id || ''; criteria.value = record?.assessment?.criteria ?? node.value?.definitionOfDone ?? '';
  reason.value = record?.assessment?.reason || ''; gaps.value = record?.assessment?.gaps || '';
  outcome.value = record?.assessment?.outcome || 'partial'; selected.value = record?.assessment?.evidence.map(row => row.id) || [];
  error.value = ''; editing.value = true;
}
function save() {
  error.value = '';
  if (!node.value) return;
  if (!criteria.value.trim()) { error.value = '先为这个节点补充完成标准，再进行验收。'; return; }
  if (!reason.value.trim()) { error.value = '请写下本次判断依据。'; return; }
  if (missing.value.length) { error.value = '部分证据已删除，请移除后重新判断。'; return; }
  if (outcome.value === 'met' && !selected.value.length) { error.value = '已达标需要至少关联一份可核对的资料或成果。'; return; }
  if (selected.value.length > 10) { error.value = '每次验收最多关联 10 份资料。'; return; }
  if (!editingId.value && state.reviews.length >= 30) { error.value = '最多保留 30 份回顾，请先导出整理。'; return; }
  try {
    const assessment = validateAssessment({ criteria: criteria.value, reason: reason.value.trim(), gaps: gaps.value.trim(), outcome: outcome.value, evidence: selected.value.map(id => ({ id, name: state.materials.find(row => row.id === id)!.name })) })!;
    const existing = state.reviews.find(row => row.id === editingId.value);
    if (editingId.value && !existing) { error.value = '原记录已删除，请取消后重新创建。'; return; }
    const values = { body: assessmentBody(assessment), assessment };
    if (existing) Object.assign(existing, values);
    else state.reviews.push({ id: uuid(), spaceId: props.spaceId, title: `${node.value.title.slice(0, 100)} · 节点验收`, date: new Date().toISOString(), ...values });
    editing.value = false;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '未能保存验收。'; }
}
async function remove(id: string) {
  if (!await props.askDelete('删除这份验收记录？')) return;
  const index = state.reviews.findIndex(row => row.id === id); if (index >= 0) { const previous = history.value[0]?.id; state.reviews.splice(index, 1); emit('deleted', previous); }
}
</script>

<template>
  <section class="panel assessment-panel" aria-label="节点验收">
    <div class="section-heading"><div><span class="section-number">目标验收</span><h2>这一步，达到了吗？</h2></div><button v-if="!editing" class="button secondary" @click="open()">记录一次验收</button></div>
    <p class="help-text">按完成标准核对成果，保留每次判断的依据。验收结论独立于行动完成率。</p>
    <form v-if="editing" class="assessment-form" @submit.prevent="save">
      <label>本次验收标准<textarea :value="criteria" readonly rows="3"></textarea></label>
      <p class="help-text">保存当时的标准作为快照。修改目标标准后，请新建一次验收。</p>
      <label>验收结论<select v-model="outcome"><option value="partial">部分达标</option><option value="not_yet">尚未达标</option><option value="met">已达标</option></select></label>
      <label>判断依据<textarea v-model="reason" rows="3" maxlength="1000" placeholder="哪些成果达到了标准？哪些部分还不能确认？"></textarea></label>
      <fieldset><legend>关联证据（最多 10 份）</legend><p v-if="!available.length && !missing.length" class="help-text">暂无相关资料，可先到资料库记录成果；未达标或部分达标也可以先保存。</p>
        <label v-for="material in available" :key="material.id" class="assessment-evidence"><input v-model="selected" type="checkbox" :value="material.id"><span>{{ material.name }}<small>{{ material.kind }}</small></span></label>
        <div v-for="id in missing" :key="id" class="assessment-evidence"><span>资料已删除</span><button type="button" class="text-link" @click="selected = selected.filter(value => value !== id)">移除失效关联</button></div>
      </fieldset>
      <label>不足与下一步<textarea v-model="gaps" rows="2" maxlength="1000" placeholder="下一次应该补充什么？"></textarea></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="inline-actions"><button class="button primary">保存验收</button><button type="button" class="button secondary" @click="editing = false">取消</button></div>
    </form>
    <p v-else-if="!records.length" class="help-text">还没有验收记录。可以在完成一项成果后回来核对。</p>
    <details v-for="record in records" :key="record.id" class="assessment-record">
      <summary>{{ assessmentLabel(record.assessment!.outcome) }} · {{ timeLabel(record.date) }} · 用户自评</summary>
      <p v-if="record.assessment!.criteria !== node?.definitionOfDone" class="notice">完成标准已变化，这份结论依据的是当时的标准。</p>
      <pre>{{ record.body }}</pre>
      <p v-if="record.assessment!.evidence.some(row => !state.materials.some(material => material.id === row.id))" class="help-text">部分关联资料已删除，名称快照保留，证据需重新核对。</p>
      <div class="inline-actions"><button class="text-link" @click="open(record)">调整验收</button><button class="text-link danger" @click="remove(record.id)">删除验收</button></div>
    </details>
  </section>
</template>

<style scoped>
.assessment-panel { padding: 28px; margin: 24px 0; }
.assessment-form { display: grid; gap: 16px; margin-top: 24px; }
.assessment-form > label { display: grid; gap: 8px; }
fieldset { border: 1px solid #dfe4d8; border-radius: 12px; padding: 16px; max-height: 300px; overflow: auto; }
.assessment-evidence { display: flex; gap: 10px; align-items: center; padding: 8px 0; }
.assessment-evidence input { width: auto; flex: 0 0 auto; }
.assessment-evidence span { overflow-wrap: anywhere; }
small { display: block; opacity: .7; }
.assessment-record { border-top: 1px solid #dfe4d8; margin-top: 16px; padding-top: 16px; }
summary { cursor: pointer; }
pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 640px) { .assessment-panel { padding: 18px; } .section-heading { flex-wrap: wrap; gap: 12px; } }
</style>
