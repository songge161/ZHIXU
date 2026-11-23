<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';

defineProps<{ disabled: boolean; label: string }>();
defineEmits<{ change: [event: Event] }>();
const input = ref<HTMLInputElement>();
</script>

<template>
  <button type="button" class="button secondary" :disabled="disabled" @click="input?.click()">
    <Icon name="upload" :size="16" /><slot />
  </button>
  <input ref="input" type="file" hidden multiple :aria-label="label" :disabled="disabled" @change="$emit('change', $event)">
</template>
