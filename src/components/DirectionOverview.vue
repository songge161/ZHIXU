<script setup lang="ts">
import { spaceOriginLabel, type Space } from '../state';
import Icon from './Icon.vue';
defineProps<{ spaces: Space[]; progress: (id: string) => { percent: number; done: number; total: number }; childCount: (id: string) => number }>();
defineEmits<{ create: []; start: []; edit: [id: string] }>();
</script>

<template>
  <section class="directions-section overview-directions">
    <div class="section-heading">
      <h2>大方向 <span>{{ spaces.length }}</span></h2>
      <div class="inline-actions">
        <button v-if="spaces.length" class="text-link" @click="$emit('start')">从模板起步</button>
        <button class="button primary" @click="$emit('create')"><Icon name="plus" :size="16" /> 新建大方向</button>
      </div>
    </div>
    <div class="overview-grid">
      <article v-for="space in spaces" :key="space.id" class="panel overview-card">
        <RouterLink :to="`/planner/spaces/${encodeURIComponent(space.id)}`" class="overview-open" :aria-label="`查看方向：${space.title}`">
          <span class="space-icon" :class="space.color"><Icon :name="space.icon" /></span>
          <small v-if="spaceOriginLabel(space)" class="origin-label">{{ spaceOriginLabel(space) }}</small>
          <h3>{{ space.title }}</h3>
          <p>{{ space.description || '进入这个方向，创建子方向和行动。' }}</p>
          <div class="progress-label"><span>加权执行进度</span><strong>{{ progress(space.id).percent }}%</strong></div>
          <div class="progress-track"><span :style="{ width: `${progress(space.id).percent}%` }"></span></div>
          <div class="overview-meta">{{ childCount(space.id) }} 个子方向 · {{ progress(space.id).done }}/{{ progress(space.id).total }} 个行动完成</div>
          <span class="text-link">进入方向 <Icon name="arrow" :size="16" /></span>
        </RouterLink>
        <div class="overview-card-footer"><span>{{ space.milestone || '尚未设置阶段目标' }}</span><button class="text-link" :aria-label="`调整${space.title}`" @click="$emit('edit', space.id)">编辑</button></div>
      </article>
    </div>
    <div v-if="!spaces.length" class="panel empty-state">
      <h3>从一个方向和一个小行动开始</h3>
      <p>写下你想学什么，以及准备迈出的第一步，也可以选用模板。</p>
      <button class="button primary" @click="$emit('start')">创建第一份计划</button>
    </div>
    <p v-if="spaces.length" class="help-text overview-note">大方向由你建立。进入方向后，可以让 AI 在选定范围内细化子方向、安排和调整行动。</p>
  </section>
</template>

<style scoped>
.origin-label { margin-left: 10px; color: #516848; font-size: 12px; }
.overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}.overview-card{overflow:hidden}.overview-open{display:block;padding:24px;color:inherit}.overview-open:hover{background:#f6f8f2}.overview-open h3{font-size:18px;margin:16px 0 10px;overflow-wrap:anywhere}.overview-open p{font-size:13px;line-height:1.8;min-height:48px;color:#73826a}.overview-meta{font-size:12px;color:#748269;margin:15px 0 22px}.overview-card-footer{display:flex;align-items:center;gap:16px;justify-content:space-between;border-top:1px solid #e6ebdf;padding:15px 24px;font-size:12px;color:#73826a}.overview-card-footer span{overflow-wrap:anywhere}.overview-card-footer button{flex-shrink:0}.overview-note{margin-top:22px}.overview-open:focus-visible{outline:2px solid #496f52;outline-offset:-3px}@media(max-width:600px){.overview-grid{grid-template-columns:minmax(0,1fr)}}
</style>
<style scoped>
.overview-open p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;min-height:0;height:47px}
.overview-card-footer>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;line-height:1.7}
</style>
