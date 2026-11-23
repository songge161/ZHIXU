import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { eduAiPlugin } from './vite-ai-plugin';

export default defineConfig({ plugins: [vue(), eduAiPlugin()] });
