<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { recordLabels, type RecordGroup, type ProposalPreview } from '../proposalBudget';
import { outputTokens } from '../modelRequest';
import type { Workspace } from '../state';

const props = defineProps<{ plan: ProposalPreview; source: Workspace }>();
const group = ref<RecordGroup>('materials');
const selectedId = ref('');
watch([group, () => props.source], () => { selectedId.value = ''; });
const sentIds = computed(() => new Set(props.plan.workspace[group.value].map(row => row.id)));
const original = computed(() => props.source[group.value].find(row => row.id === selectedId.value));
const excerpt = computed(() => props.plan.workspace[group.value].find(row => row.id === selectedId.value));
const open = ref(false);
</script>

<template>
  <section class="budget" aria-label="本轮输入预算">
    <strong>本轮输入 {{ plan.bytes.toLocaleString() }} / {{ plan.limit.toLocaleString() }} 字节</strong>
    <p class="help-text">含系统说明、问题、阶段摘要与结构化记录。生成提案调用一次模型，输出上限 {{ outputTokens }} token。输入按 UTF-8 字节计量，实际 token 由模型决定。</p>
    <p v-if="plan.blocked" class="form-error" role="alert">必要记录已超过本档预算，请选取较小的方向或在设置中调整资料深度。</p>
    <details @toggle="open = ($event.target as HTMLDetailsElement).open">
      <summary>查看阶段摘要与取材明细</summary>
      <template v-if="open">
        <p class="summary">{{ plan.context }}</p>
        <p>以下数量为结构化记录的选入数 / 范围内候选数。文本字段可能只选入摘录。</p>
        <ul><li v-for="(label, key) in recordLabels" :key="key">{{ label }} {{ plan.workspace[key].length }} / {{ source[key].length }}</li>
          <li>行动总结 {{ plan.workspace.tasks.filter(t => t.summary).length }} / {{ source.tasks.filter(t => t.summary).length }}</li>
          <li>日历标记 {{ plan.workspace.scheduleSettings.calendarHolidays.length }} / {{ source.scheduleSettings.calendarHolidays.length }}</li></ul>
        <label>记录类型<select v-model="group"><option v-for="(label, key) in recordLabels" :key="key" :value="key">{{ label }}</option></select></label>
        <label>核对原文<select v-model="selectedId"><option value="">选择记录</option><option v-for="row in source[group]" :key="row.id" :value="row.id">{{ sentIds.has(row.id) ? '已选' : '省略' }} · {{ 'title' in row ? row.title : 'name' in row ? row.name : 'text' in row ? row.text.slice(0, 50) : row.note.slice(0, 50) }}</option></select></label>
        <template v-if="original"><h3>本地原文</h3><pre>{{ JSON.stringify(original, null, 2) }}</pre>
          <h3>本轮结构化记录</h3><pre v-if="excerpt">{{ JSON.stringify(excerpt, null, 2) }}</pre><p v-else>本轮未选入这条明细。</p></template>
      </template>
    </details>
  </section>
</template>

<style scoped>
.budget { margin: 16px 0; font-size: 13px; }
summary { cursor: pointer; padding: 8px 0; }
.summary, pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.summary { line-height: 1.65; }
ul { padding-left: 1.5em; }
label { display: block; margin: 8px 0; }
select { display: block; max-width: 100%; }
pre { max-height: 18rem; overflow: auto; }
</style>
