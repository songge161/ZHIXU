<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
const dialog = ref<HTMLDialogElement>();
const question = ref('');
let resolve: ((answer: boolean) => void) | undefined;
function ask(message: string) {
  if (resolve || !dialog.value) return Promise.resolve(false);
  question.value = message;
  dialog.value.returnValue = '';
  dialog.value.showModal();
  return new Promise<boolean>(done => { resolve = done; });
}
function finish() {
  resolve?.(dialog.value?.returnValue === 'delete');
  resolve = undefined;
  question.value = '';
}
onUnmounted(() => resolve?.(false));
defineExpose({ ask });
</script>
<template>
  <dialog ref="dialog" class="modal" aria-labelledby="delete-heading" aria-describedby="delete-question" @close="finish">
    <div class="modal-heading"><h2 id="delete-heading">确认删除</h2></div>
    <form method="dialog" class="modal-body"><p id="delete-question">{{ question }}</p><div class="modal-actions">
      <button autofocus class="button secondary" value="cancel">取消</button>
      <button class="button danger-button" value="delete">确认删除</button>
    </div></form>
  </dialog>
</template>
