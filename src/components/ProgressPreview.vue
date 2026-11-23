<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Workspace } from '../state';
import { progressChanges } from '../progress';
const props = defineProps<{ before: Workspace; after?: Workspace; error?: string }>();
const expanded = ref(false);
const changes = computed(() => props.after ? progressChanges(props.before, props.after) : []);
const visible = computed(() => expanded.value ? changes.value : changes.value.slice(0, 6));
watch(() => props.after, () => { expanded.value = false; });
</script>

<template>
  <section class="progress-preview" aria-label="调整影响预览">
    <h3>调整影响预览</h3>
    <p class="help-text">预览尚未保存。分量、难度和结构调整会改变进度口径；新增行动会改变分母。</p>
    <p v-if="error" class="form-error" role="status">暂不能预览：{{ error }}</p>
    <template v-else-if="after">
      <p class="preview-count">全工作区：已完成行动 {{ before.tasks.filter(row => row.done).length }} → {{ after.tasks.filter(row => row.done).length }} · 行动总数 {{ before.tasks.length }} → {{ after.tasks.length }}</p>
      <p v-if="!changes.length" class="help-text">当前调整不会改变显示进度、完成数量或占比。</p>
      <div v-for="row in visible" :key="row.id" class="preview-change">
        <strong>{{ row.title }} <small>{{ row.kind }}</small></strong>
        <small v-if="row.from !== row.to">归属：{{ row.from }} → {{ row.to }}</small>
        <span>调整前：{{ row.before }}</span><span>调整后：{{ row.after }}</span>
      </div>
      <button v-if="changes.length > 6" type="button" class="text-link" @click="expanded = !expanded">{{ expanded ? '收起明细' : `查看全部 ${changes.length} 项变化` }}</button>
    </template>
  </section>
</template>

<style scoped>
.progress-preview { background: #f3f6ee; border: 1px solid #dce5d3; border-radius: 12px; padding: 18px; margin: 16px 0; min-width: 0; }
h3 { font-size: 14px; margin-bottom: 8px; }
.preview-count { font-size: 12px; margin: 12px 0; }
.preview-change { display: grid; gap: 5px; border-top: 1px solid #dfe6d8; padding: 12px 0; font-size: 12px; overflow-wrap: anywhere; }
small { font-size: 11px; font-weight: normal; opacity: .75; }
.preview-change > span { line-height: 1.7; }
</style>
