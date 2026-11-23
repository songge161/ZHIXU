import { createApp } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';

import './style.css';
import './forms.css';
import './schedule.css';
import './schedule-theme.css';
import './usability.css';

const workspace = () => import('./App.vue');
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved || { top: 0 },
  routes: [
    { path: '/', name: 'edu-home', component: () => import('./PortalView.vue') },
    { path: '/planner', name: 'planner-home', component: workspace },
    { path: '/planner/spaces/:spaceId', name: 'planner-space', component: workspace },
    { path: '/planner/today', name: 'planner-today', component: workspace },
    { path: '/planner/schedule', name: 'planner-schedule', component: workspace },
    { path: '/planner/materials', name: 'planner-materials', component: workspace },
    { path: '/planner/reviews', name: 'planner-reviews', component: workspace },
    { path: '/planner/ai', name: 'planner-ai', component: workspace },
    { path: '/planner/sync', name: 'planner-sync', component: workspace },
    { path: '/settings', name: 'edu-settings', component: workspace },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: workspace },
  ],
});
createApp(RouterView).use(router).mount('#app');
