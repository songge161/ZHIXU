<script setup lang="ts">
import { computed } from 'vue';
import type { Material } from '../state';
import { materialParts } from '../materialSearch';
const props = defineProps<{ material: Material }>();
const pointers = computed(() => {
  const parts = materialParts(props.material);
  return (props.material.guide?.pointers || []).flatMap(pointer => {
    const part = parts[pointer.part - 1];
    return part ? [{ ...pointer, location: part.location, text: part.text }] : [];
  });
});
</script>
<template>
  <div v-if="material.guide">
    <p class="material-excerpt"><strong>AI 导读</strong> · {{ material.guide.summary }}</p>
    <details v-if="pointers.length"><summary>可查的问题（{{ pointers.length }}）</summary>
      <details v-for="p in pointers" :key="p.part + p.topic" class="pointer"><summary>{{ p.topic }}</summary>
        <small>{{ p.location }} · 片段 {{ p.part }}</small><pre>{{ p.text }}</pre>
      </details>
    </details>
  </div>
</template>
<style scoped>
.pointer { margin: 8px 0 8px 12px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
