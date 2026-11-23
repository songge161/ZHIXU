<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Task, ActionMode } from '../state';
import { minutesLabel } from '../formatTime';
import DirectionPicker, { type PickerOption } from './DirectionPicker.vue';

const labels = { today: '今日行动', unscheduled: '未排期行动', future: '稍后的安排', completed: '已完成行动' };
type Group = keyof typeof labels;
const props = defineProps<{
  groups: Record<Group, Task[]>;
  directions: PickerOption[];
  subtree: (id: string) => Set<string>;
  today: string;
  dateLabel: (date: string) => string;
  spaceName: (id: string) => string;
  modeLabel: (mode: ActionMode) => string;
}>();
defineEmits<{ edit: [id: string]; create: [] }>();

const query = ref('');
const direction = ref('');
const keyword = computed(() => query.value.trim().toLocaleLowerCase());
const filtering = computed(() => Boolean(keyword.value || direction.value));
const options = computed(() => [{ value: '', label: '全部方向' }, ...props.directions]);
const sections = computed(() => {
  const scope = direction.value ? props.subtree(direction.value) : undefined;
  return (Object.keys(labels) as Group[]).map(key => ({
    key, label: labels[key],
    tasks: props.groups[key].filter(task => (!scope || scope.has(task.spaceId)) && task.title.toLocaleLowerCase().includes(keyword.value)),
  }));
});
const matchCount = computed(() => sections.value.reduce((sum, section) => sum + section.tasks.length, 0));
const dueMinutes = computed(() => sections.value[0].tasks.reduce((sum, t) => sum + t.minutes, 0));
const pageSize = 10;
const firstPage = () => ({ today: pageSize, unscheduled: pageSize, future: pageSize, completed: pageSize });
const limits = ref(firstPage());
const completedOpen = ref(false);
watch([keyword, direction], () => { limits.value = firstPage(); completedOpen.value = filtering.value; });
watch(options, rows => { if (!rows.some(row => row.value === direction.value)) direction.value = ''; });
function clearFilters() { query.value = ''; direction.value = ''; }
</script>

<template>
  <div class="daily-action-column">
    <section class="panel unscheduled-panel queue-filters" aria-label="筛选行动">
      <label>搜索行动<input v-model="query" type="search" placeholder="输入行动标题"></label>
      <div><label for="queue-direction">方向及子方向</label>
        <DirectionPicker id="queue-direction" v-model="direction" :options="options" label="筛选方向" />
      </div>
      <div v-if="filtering" class="filter-result">
        <span role="status">{{ matchCount ? '找到 ' + matchCount + ' 个行动' : '没有匹配的行动' }}</span>
        <button class="text-link" @click="clearFilters">清除筛选</button>
      </div>
    </section>
    <template v-for="section in sections" :key="section.key">
      <section v-if="section.tasks.length || (!filtering && (section.key === 'today' || section.key === 'completed'))"
        class="panel unscheduled-panel" :aria-label="section.label">
        <div class="section-heading">
          <h2>{{ section.label }} <span class="count-pill">{{ section.tasks.length }}</span></h2>
          <span v-if="section.key === 'today'" class="small muted">预计 {{ minutesLabel(dueMinutes) }}</span>
          <button v-if="section.key === 'completed' && section.tasks.length" class="text-link" :aria-expanded="completedOpen" @click="completedOpen = !completedOpen">
            {{ completedOpen ? '收起已完成' : '查看已完成' }}
          </button>
        </div>
        <template v-if="section.key !== 'completed' || completedOpen">
          <div v-for="task in section.tasks.slice(0, limits[section.key])" :key="task.id" class="task-row" :class="{ 'is-done': task.done }">
            <input :id="'queue-' + task.id" v-model="task.done" type="checkbox" :aria-label="'完成：' + task.title">
            <label :for="'queue-' + task.id"><strong>{{ task.title }}</strong>
              <span>{{ spaceName(task.spaceId) }} · {{ modeLabel(task.actionMode) }}
                <em v-if="task.date && task.date !== today">{{ section.key === 'today' ? '待接续 · ' : '' }}{{ dateLabel(task.date) }}</em>
              </span>
            </label>
            <button class="task-duration" :aria-label="'调整行动：' + task.title" @click="$emit('edit', task.id)">
              {{ task.minutes ? minutesLabel(task.minutes) : '无时长估算' }} · 调整
            </button>
          </div>
          <button v-if="section.tasks.length > limits[section.key]" class="add-row" @click="limits[section.key] += pageSize">显示更多{{ section.label }}</button>
        </template>
        <p v-if="!section.tasks.length" class="help-text">{{ section.key === 'today' ? '今天还没有待办行动。' : '还没有已完成的行动。' }}</p>
        <button v-if="section.key === 'today'" class="add-row" @click="$emit('create')">留一个小行动给今天</button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.queue-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 155px), 1fr)); gap: 12px; }
.queue-filters label { display: block; font-size: 13px; }
.queue-filters input, .queue-filters .direction-picker { margin-top: 6px; }
.queue-filters input { box-sizing: border-box; width: 100%; min-height: 42px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 7px; }
.filter-result { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
</style>
