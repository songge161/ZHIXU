<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { replaceWorkspace, state, uuid, validateWorkspace, type Space, type Task } from '../state';

const props = defineProps<{ startWithTemplate: boolean }>();
const emit = defineEmits<{ cancel: []; created: [id: string] }>();
const templates = [
  { label: '自己填写', title: '', action: '' },
  { label: '语言学习', title: '用英语讲清楚一件事', action: '选一段英语短文，读完后用自己的话复述三句' },
  { label: '论文写作', title: '写出论文的研究问题', action: '从一篇相关论文中摘出研究问题，写下我想追问的一点' },
  { label: '每周计划', title: '安排我的一周', action: '写下本周最想完成的一件事，列出它的第一步' },
];
// Keep edits for each choice while the dialog is open.
const drafts = reactive(templates.map(template => ({ ...template })));
const selected = ref(props.startWithTemplate ? 1 : 0);
const draft = computed(() => drafts[selected.value]);
const error = ref('');
function create() {
  const title = draft.value.title.trim();
  const action = draft.value.action.trim();
  if (!title || !action) { error.value = '请填写方向名称和第一个行动。'; return; }
  if (state.spaces.length >= 200 || state.tasks.length >= 500) {
    error.value = '工作区容量不足，需要留出一个方向和一个行动的位置。';
    return;
  }
  try {
    const id = uuid();
    const space: Space = { id, origin: selected.value ? 'template' : undefined, parentId: '', kind: 'direction', status: 'active',
      title, category: '长期方向', description: '', color: 'sage', icon: 'target', milestone: '', definitionOfDone: '', weight: 1, difficulty: 1 };
    const task: Task = { id: uuid(), spaceId: id, title: action, summary: '', done: false, status: 'todo', evidenceLevel: 'none',
      materialIds: [], actionMode: 'deliverable', target: '', minutes: 0, date: '', weight: 1, difficulty: 1 };
    const label = selected.value ? '采用模板 · ' + draft.value.label : '创建起步计划';
    const next = validateWorkspace({ ...state, spaces: [...state.spaces, space], tasks: [...state.tasks, task] });
    replaceWorkspace(next, label);
    emit('created', id);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '计划未能保存。'; }
}
</script>

<template>
  <form class="modal-form" @submit.prevent="create">
    <label for="starter-template">起步方式</label>
    <select id="starter-template" v-model="selected" @change="error = ''">
      <option v-for="(item, index) in drafts" :key="item.label" :value="index">{{ item.label }}</option>
    </select>
    <fieldset class="starter-preview">
      <legend>{{ selected ? '模板预览，可直接修改' : '我的计划' }}</legend>
      <label for="starter-direction">方向名称</label>
      <input id="starter-direction" v-model="draft.title" maxlength="120" required placeholder="例如：读完一本英文小说">
      <label for="starter-action">第一个行动</label>
      <textarea id="starter-action" v-model="draft.action" rows="3" maxlength="200" required placeholder="例如：读第一页并记下三个新词"></textarea>
    </fieldset>
    <p class="help-text">确认后新增一个个人方向。第一个行动会出现在「今日行动 → 未排期行动」。</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div class="modal-actions">
      <button type="button" class="button secondary" @click="$emit('cancel')">取消</button>
      <button type="submit" class="button primary" :disabled="!draft.title.trim() || !draft.action.trim()">创建方向和行动</button>
    </div>
  </form>
</template>

<style scoped>
.starter-preview { min-width: 0; margin: 18px 0 10px; padding: 12px 16px 16px; border: 1px solid var(--border); border-radius: 10px; }
.starter-preview legend { font-weight: 600; padding: 0 4px; }
.starter-preview label { display: block; margin: 10px 0 6px; }
.starter-preview textarea { resize: vertical; }
.starter-preview input, .starter-preview textarea { box-sizing: border-box; width: 100%; }
</style>
