<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { activeAiConnection, connectionReady } from '../ai';
import { askMaterialModel } from '../materialAi';
import { findPassages } from '../materialSearch';
import type { Material } from '../state';

const props = defineProps<{ materials: Material[]; scope: string }>();
const question = ref(''), answer = ref(''), error = ref(''), busy = ref(false);
const sources = computed(() => findPassages(props.materials, question.value).map((hit, i) => ({
  number: i + 1, file: hit.material.name, location: hit.location, part: hit.part, text: hit.text,
})));
let revision = 0;
watch([question, sources, () => props.scope], () => { revision++; answer.value = ''; error.value = ''; }, { flush: 'sync' });
async function ask() {
  if (!sources.value.length || busy.value) return;
  const version = revision;
  busy.value = true; error.value = ''; answer.value = '';
  try {
    const result = await askMaterialModel('answer', sources.value, question.value.trim());
    if (typeof result !== 'string' || !result.trim()) throw new Error('AI 返回了空回答。');
    if (revision === version) answer.value = result;
  } catch (e) { if (revision === version) error.value = e instanceof Error ? e.message : '问答失败，请重试。'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="panel material-questions">
    <h2>问资料</h2>
    <p class="help-text">{{ scope }} · 输入问题可预览将发送的原文，最多 3 段。</p>
    <form @submit.prevent="ask">
      <label class="sr-only" for="library-question">资料问题</label>
      <input id="library-question" v-model="question" maxlength="2000" placeholder="例如：开题报告什么时候提交？">
      <button class="button secondary" :disabled="busy || !sources.length || !connectionReady(activeAiConnection)">{{ busy ? '回答中…' : '根据资料回答' }}</button>
    </form>
    <p v-if="!connectionReady(activeAiConnection)" class="help-text"><RouterLink to="/settings">配置 AI 接口</RouterLink>后可生成回答。现在可以检索和查看原文。</p>
    <p v-if="question.trim() && !sources.length" class="help-text">当前范围没有匹配原文。可以换个关键词，或切换资料库。</p>
    <details v-if="sources.length"><summary>本次引用 {{ sources.length }} 段 · 原文 {{ sources.reduce((n, s) => n + s.text.length, 0) }} 字符</summary>
      <div v-for="s in sources" :key="s.number"><strong>[{{ s.number }}] {{ s.file }} · {{ s.location }} · 片段 {{ s.part }}</strong><pre>{{ s.text }}</pre></div>
    </details>
    <p v-if="answer" aria-live="polite" class="library-answer">{{ answer }}</p>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </section>
</template>
<style scoped>
.material-questions { padding: 20px; margin-block: 18px; }
h2 { margin: 0; font-size: 1.15rem; }
form { display: flex; flex-wrap: wrap; gap: 10px; }
input { flex: 1 1 220px; min-width: 0; }
details { margin-top: 12px; }
summary { cursor: pointer; }
details div { margin: 12px 0; }
pre, .library-answer { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
</style>
