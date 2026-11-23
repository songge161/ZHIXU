<script setup lang="ts">
import { ref } from 'vue';
import { history, historyNotice, timeLabel, undoAdjustment } from '../state';
import { historyLimit, tableLabels } from '../history';

const message = ref('');
function undo(id: string) {
  try {
    undoAdjustment(id);
    message.value = '已撤销这次调整。';
  } catch (error) { message.value = error instanceof Error ? error.message : '撤销失败。'; }
}
</script>

<template>
  <section class="panel settings-card">
    <div class="section-heading"><h2>调整历史</h2>
      <button v-if="history.length" class="button secondary" @click="undo(history[0].id)">撤销最近一次调整</button>
    </div>
    <p class="help-text">本浏览器最多保留 {{ historyLimit }} 次调整，共 512 KiB，可从最近一次开始撤销。撤销结果保存在浏览器，需要时可手动写入目录。读取目录、清空工作区或载入示例后重新记录。</p>
    <p v-if="historyNotice">{{ historyNotice }}</p>
    <p v-if="!history.length" class="help-text">暂无可撤销的调整。</p>
    <details v-for="entry in history" :key="entry.id">
      <summary>{{ entry.label }} · {{ entry.changes[0].name }} · {{ entry.changes.length }} 条记录 · {{ timeLabel(entry.at) }}</summary>
      <ul>
        <li v-for="change in entry.changes" :key="change.table + ':' + change.id">
          {{ change.before === null ? '新增' : change.after === null ? '删除' : '修改' }}{{ tableLabels[change.table] }} · {{ change.name }}
        </li>
      </ul>
    </details>
    <p role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
details { padding: .65rem 0; border-top: 1px solid #dee4e0; overflow-wrap: anywhere; }
summary { cursor: pointer; }
ul { padding-inline-start: 1.5rem; }
p:empty { display: none; }
</style>
