<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{ valid: [] }>();
const errors = ref<{ field: HTMLElement; message: string }[]>([]);
function clear(e: Event) {
  const field = e.target as HTMLElement;
  if (!errors.value.some(item => item.field === field)) return;
  errors.value = errors.value.filter(item => item.field !== field);
  field.removeAttribute('aria-invalid');
  field.removeAttribute('aria-errormessage');
}
function submit(e: Event) {
  const form = e.currentTarget as HTMLFormElement;
  errors.value = [];
  for (const field of form.elements) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.willValidate) continue;
    const blank = field.required && !field.value.trim();
    if (field.validity.valid && !blank) continue;
    const name = field.getAttribute('aria-label') || field.labels?.[0]?.textContent?.trim() || '此项';
    errors.value.push({ field, message: blank ? '请填写' + name : name + '：' + field.validationMessage });
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-errormessage', 'form-error-' + errors.value.length);
    field.closest('details')?.setAttribute('open', '');
  }
  if (errors.value.length) errors.value[0].field.focus();
  else emit('valid');
}
</script>
<template>
  <form novalidate @submit.prevent="submit" @input="clear" @change="clear">
    <div v-if="errors.length" role="alert" class="form-error">
      <p v-for="item in errors" :id="item.field.getAttribute('aria-errormessage')!" :key="item.message">{{ item.message }}</p>
    </div>
    <slot />
  </form>
</template>
