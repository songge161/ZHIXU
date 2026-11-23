<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Icon from './components/Icon.vue';
const route = useRoute();
const lanTestUrl = computed(() => import.meta.env.DEV && route.query.lan === '1' ? 'http://192.168.50.240:4180' : '');
onMounted(() => { document.title = '教育门户 · 知序'; });
</script>
<template>
  <a href="#main-content" class="skip-link">跳到主内容</a>
  <div class="portal">
    <header class="portal-header wrap"><RouterLink to="/" class="brand"><span class="brand-mark"><Icon name="book" :size="23" /></span><span>知序<span class="brand-divider">/</span><small>EDU</small></span></RouterLink><nav><span class="portal-current">学习与成长</span><RouterLink to="/settings" aria-label="设置"><Icon name="settings" /></RouterLink><RouterLink to="/planner" class="text-link">打开我的学习规划 <Icon name="arrow" :size="16" /></RouterLink></nav></header>
    <main id="main-content" tabindex="-1" class="wrap portal-main">
      <div class="portal-intro"><div class="eyebrow"><span class="tiny-line"></span> A PLACE TO GROW</div><h1>让学习，慢慢成为<br>自己的<span>体系。</span></h1><p>一个正在生长的个人教育空间。<br>安放长远的方向，也照顾今天的一小步。</p><RouterLink to="/planner" class="button primary large">打开我的学习规划 <Icon name="arrow" :size="19" /></RouterLink><a v-if="lanTestUrl" :href="lanTestUrl" class="lan-test-link">局域网测试入口 · {{ lanTestUrl }} <Icon name="arrow" :size="14" /></a><div class="portal-note"><span class="status-dot"></span> 本地优先，从你的节奏开始</div></div>
      <div class="portal-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-center"><Icon name="leaf" :size="58" /></div><div class="art-label label-a"><span>01</span> 探索方向</div><div class="art-label label-b"><span>02</span> 持续行动</div><div class="art-label label-c"><span>03</span> 看见成长</div><div class="art-dot dot-a"></div><div class="art-dot dot-b"></div><div class="art-caption">LEARNING IS A LIFELONG PRACTICE</div></div>
      <section class="portal-sections"><div class="portal-section active"><span class="section-number">01 / AVAILABLE</span><h2>学习规划 <Icon name="arrow" /></h2><p>从长期方向到每日行动，持续讨论与调整。</p><RouterLink to="/planner" class="text-link">打开我的学习规划</RouterLink></div><div class="portal-section"><span class="section-number">02 / COMING LATER</span><h2>知识与课程</h2><p>为未来的学科、课程与知识体系留一扇门。</p><span class="muted small">筹备中</span></div><div class="portal-section"><span class="section-number">03 / COMING LATER</span><h2>研究与成果</h2><p>收集探索留下的作品，连接下一次发现。</p><span class="muted small">筹备中</span></div></section>
    </main><footer class="wrap portal-footer"><span>知序 · 个人教育空间</span><span>本地交互原型 v0.1 · 尚未接入云端</span></footer>
  </div>

</template>
