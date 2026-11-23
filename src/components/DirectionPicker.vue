<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
export interface PickerOption { value: string; label: string; description?: string; depth?: number }
const props = withDefaults(defineProps<{ id: string; modelValue: string; options: PickerOption[]; disabled?: boolean; label?: string }>(), { disabled: false });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const search = ref<HTMLInputElement>();
const panel = ref<HTMLElement>();
const open = ref(false);
const query = ref('');
const active = ref(0);
const position = ref<Record<string, string>>({});
const selected = computed(() => props.options.find(o => o.value === props.modelValue));
const filtered = computed(() => props.options.filter(o => `${o.label} ${o.description || ''}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
function close(restore = false) { open.value = false; if (restore) trigger.value?.focus(); }
async function show() {
  if (props.disabled) return;
  query.value = ''; active.value = Math.max(0, props.options.findIndex(o => o.value === props.modelValue));
  const rect = trigger.value!.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  const upwards = below < 270 && above > below;
  const height = Math.min(340, (upwards ? above : below) - 16);
  position.value = { left: `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(rect.width, window.innerWidth - 16) - 8))}px`, width: `${Math.min(rect.width, window.innerWidth - 16)}px`, maxHeight: `${Math.max(120, height)}px`, ...(upwards ? { bottom: `${window.innerHeight - rect.top + 6}px` } : { top: `${rect.bottom + 6}px` }) };
  open.value = true; await nextTick(); search.value?.focus(); reveal();
}
function pick(option: PickerOption) { emit('update:modelValue', option.value); close(true); }
function reveal() { nextTick(() => panel.value?.querySelector(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })); }
function keys(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'Escape' && open.value) { event.preventDefault(); event.stopPropagation(); close(true); return; }
  if (event.key === 'Tab' && open.value) { close(true); return; }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); event.stopPropagation();
    if (!open.value) { show(); return; }
    active.value = Math.max(0, Math.min(filtered.value.length - 1, active.value + (event.key === 'ArrowDown' ? 1 : -1))); reveal();
  }
  if (event.key === 'Enter' && open.value) { event.preventDefault(); event.stopPropagation(); const option = filtered.value[active.value]; if (option) pick(option); }
}
watch(query, () => { active.value = 0; });
watch(() => props.options, () => { active.value = Math.min(active.value, Math.max(0, filtered.value.length - 1)); });
watch(() => props.disabled, value => { if (value) close(); });
function outside(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) close(); }
function moved(event: Event) { if (!panel.value?.contains(event.target as Node)) close(); }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('resize', moved); window.addEventListener('scroll', moved, true); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', moved); window.removeEventListener('scroll', moved, true); });
</script>

<template>
  <div ref="root" class="direction-picker" @keydown="keys">
    <button :id="id" ref="trigger" type="button" class="picker-trigger" role="combobox" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="`${id}-list`" :aria-label="label" :data-value="modelValue" :disabled="disabled" @click="open ? close() : show()">
      <span class="picker-selection"><span>{{ selected?.label || '请选择方向' }}</span><small v-if="selected?.description">{{ selected.description }}</small></span>
      <svg class="picker-chevron" :class="{ expanded: open }" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div v-if="open" ref="panel" class="picker-panel" :style="position">
      <div class="picker-search"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.5"/></svg><input ref="search" v-model="query" type="search" autocomplete="off" placeholder="搜索名称或上级方向…" aria-label="搜索方向" role="combobox" :aria-expanded="true" :aria-controls="`${id}-list`" :aria-activedescendant="filtered[active] ? `${id}-option-${active}` : undefined"></div>
      <div :id="`${id}-list`" class="picker-options" role="listbox" :aria-label="label || '可选方向'">
        <div v-for="(option, index) in filtered" :id="`${id}-option-${index}`" :key="option.value" role="option" :aria-selected="option.value === modelValue" :data-index="index" class="picker-option" :class="{ highlighted: index === active, chosen: option.value === modelValue }" @pointermove="active = index" @mousedown.prevent @click="pick(option)">
          <span v-if="option.depth" class="picker-branch" aria-hidden="true">↳</span><span class="picker-option-copy"><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span><span v-if="option.value === modelValue" class="picker-check" aria-hidden="true">✓</span>
        </div>
        <p v-if="!filtered.length" class="picker-empty" role="status">没有匹配的方向，试试其他关键词。</p>
      </div>
      <div class="picker-foot">{{ filtered.length }} 个选项 <span>↑ ↓ 切换 · Enter 选择</span></div>
    </div>
  </div>
</template>

<style scoped>
.direction-picker{min-width:0;width:100%}.picker-trigger{width:100%;min-height:48px;display:flex;align-items:center;gap:12px;text-align:left;border:1px solid #dce4db;border-radius:10px;padding:10px 14px;background:#fff;box-shadow:0 1px 2px #233d2c04;transition:border-color .15s,box-shadow .15s}.picker-trigger:hover:not(:disabled){border-color:#98af9b;background:#fdfefb}.picker-trigger[aria-expanded=true]{border-color:#648a70;box-shadow:0 0 0 3px #628c6e14}.picker-selection{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px;color:#324a3d;font-size:13px}.picker-selection>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.picker-selection small{color:var(--readable-muted);font-size:var(--text-caption);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.picker-chevron{color:#80917e;transition:transform .15s}.picker-chevron.expanded{transform:rotate(180deg)}.picker-panel{position:fixed;z-index:200;display:flex;flex-direction:column;background:#fff;border:1px solid #dfe7da;border-radius:12px;box-shadow:0 12px 36px #263e3024,0 2px 6px #263e3010;overflow:hidden;animation:picker-in .13s ease-out}.picker-search{display:flex;align-items:center;gap:9px;padding:10px 13px;border-bottom:1px solid #edf0e9;color:#82927c}.picker-search input{min-width:0;min-height:32px;margin:0!important;padding:4px 0!important;font-size:13px!important;border:0!important;background:transparent!important;box-shadow:none!important;outline:0!important}.picker-options{padding:6px;overflow-y:auto;overscroll-behavior:contain;min-height:0;scrollbar-width:thin}.picker-option{display:flex;align-items:center;gap:10px;min-height:43px;padding:10px;border-radius:7px;cursor:pointer}.picker-option.highlighted{background:#f0f4ed}.picker-option.chosen{color:#305943}.picker-option-copy{min-width:0;flex:1}.picker-option strong{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere;line-height:1.5}.picker-option small{display:block;color:var(--readable-muted);font-size:var(--text-caption);margin-top:3px;line-height:1.5;overflow-wrap:anywhere}.picker-check{color:#527c5d;font-size:15px}.picker-branch{color:#95a78b}.picker-empty{padding:22px 10px;font-size:12px;line-height:1.8;color:#788575}.picker-foot{padding:9px 13px;border-top:1px solid #edf0e9;color:var(--readable-muted);font-size:var(--text-caption);display:flex;justify-content:space-between;gap:12px}.picker-foot span{color:inherit}@keyframes picker-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.picker-panel{animation:none}.picker-chevron,.picker-trigger{transition:none}}@media(max-width:600px){.picker-trigger{min-height:48px}.picker-option{min-height:48px}.picker-foot span{display:none}.picker-search input{font-size:16px!important}}
</style>
