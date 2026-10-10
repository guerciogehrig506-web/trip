<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  content: string
}>()

// Configure marked once: GFM line breaks, synchronous parsing.
marked.setOptions({
  gfm: true,
  breaks: true,
})

const html = computed(() => {
  if (!props.content) return ''
  // Force synchronous parse to avoid [object Promise] rendering.
  return marked.parse(props.content, { async: false }) as string
})
</script>

<template>
  <div class="md-viewer" v-html="html"></div>
</template>

<style scoped>
/* Mobile-first reading typography: large base font, generous line height. */
.md-viewer {
  font-size: 17px;
  line-height: 1.85;
  color: #1e293b;
  word-break: break-word;
}
.dark .md-viewer {
  color: #e2e8f0;
}

.md-viewer :deep(h1) {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 1.2rem 0 0.8rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.3);
  line-height: 1.3;
}
.md-viewer :deep(h2) {
  font-size: 1.3rem;
  font-weight: 600;
  margin: 1.1rem 0 0.6rem;
  line-height: 1.35;
}
.md-viewer :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem;
}

.md-viewer :deep(p) {
  margin: 0.6rem 0;
}

.md-viewer :deep(ul),
.md-viewer :deep(ol) {
  padding-left: 1.4rem;
  margin: 0.6rem 0;
}
.md-viewer :deep(li) {
  margin: 0.25rem 0;
}

.md-viewer :deep(blockquote) {
  margin: 0.8rem 0;
  padding: 0.4rem 0.9rem;
  border-left: 3px solid #3b82f6;
  background: rgba(59, 130, 246, 0.06);
  color: #475569;
  border-radius: 0 0.5rem 0.5rem 0;
}
.dark .md-viewer :deep(blockquote) {
  color: #cbd5e1;
  background: rgba(59, 130, 246, 0.12);
}

.md-viewer :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  background: rgba(148, 163, 184, 0.18);
  padding: 0.1rem 0.35rem;
  border-radius: 0.3rem;
}
.md-viewer :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.9rem 1rem;
  border-radius: 0.75rem;
  overflow-x: auto;
  margin: 0.8rem 0;
  font-size: 0.9rem;
  line-height: 1.6;
}
.md-viewer :deep(pre code) {
  background: transparent;
  padding: 0;
}

.md-viewer :deep(a) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.dark .md-viewer :deep(a) {
  color: #60a5fa;
}

.md-viewer :deep(hr) {
  border: none;
  border-top: 1px solid rgba(148, 163, 184, 0.3);
  margin: 1.2rem 0;
}

.md-viewer :deep(img) {
  max-width: 100%;
  border-radius: 0.75rem;
  margin: 0.8rem 0;
}

.md-viewer :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8rem 0;
  font-size: 0.95em;
}
.md-viewer :deep(th),
.md-viewer :deep(td) {
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.md-viewer :deep(th) {
  background: rgba(148, 163, 184, 0.12);
}

.md-viewer :deep(input[type='checkbox']) {
  margin-right: 0.4rem;
}
</style>
