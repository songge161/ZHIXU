<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  book: 'M12 5v16 M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-3-1-7-2-10 1z',
  calendar: 'M8 2v4 M16 2v4 M3 9h18 M4 4h16v17H4z M8 13h3 M8 17h7',
  folder: 'M3 6h7l2 3h9v11H3z M3 6V4h6l2 2h10v3',
  chart: 'M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5',
  sync: 'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  plus: 'M12 5v14 M5 12h14',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 2v4 M18 4h4',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12 M18 6 6 18',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 11v2',
  file: 'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h6',
  upload: 'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
  download: 'M12 3v13 M7 11l5 5 5-5 M4 18v3h16v-3',
  laptop: 'M5 3h14v13H5z M2 20l3-4h14l3 4z',
  cloud: 'M6 18a5 5 0 1 1 0-10 7 7 0 0 1 13 1 4.5 4.5 0 0 1-1 9z',
  leaf: 'M5 20c-3-10 0-15 15-16 0 12-5 17-12 14 M5 20 15 10',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  send: 'm3 3 19 9-19 9 4-9z M7 12h15',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3 M5 10h14v11H5z M12 14v3',
};
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.file" /></svg></template>
