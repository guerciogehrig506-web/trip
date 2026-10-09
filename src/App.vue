<script setup lang="ts">
import { ref } from 'vue'
import AuthConfigModal from '@/components/AuthConfigModal.vue'
import { useConfig } from '@/composables/useConfig'
import { githubService } from '@/composables/githubService'

const { owner, repo, hasConfig } = useConfig()

const showConfig = ref(false)

// Hidden trigger: click the app title 5 times to open the config sheet.
const clickCount = ref(0)
let resetTimer: number | undefined
function onSecretClick() {
  clickCount.value += 1
  if (clickCount.value >= 5) {
    clickCount.value = 0
    showConfig.value = true
  }
  window.clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => {
    clickCount.value = 0
  }, 1500)
}

// --- Quick demo for the GitHub service (Module 1 verification) ---
const demoPath = ref('data/test.md')
const fetchedContent = ref('')
const fetchedSha = ref('')
const fetchLoading = ref(false)
const updateLoading = ref(false)
const resultMsg = ref<{ type: 'ok' | 'err'; text: string } | null>(null)

async function handleFetch() {
  fetchLoading.value = true
  resultMsg.value = null
  try {
    const file = await githubService.fetchFile(demoPath.value)
    fetchedContent.value = file.content
    fetchedSha.value = file.sha
    resultMsg.value = { type: 'ok', text: `已读取，sha: ${file.sha.slice(0, 8)}…` }
  } catch (e: any) {
    resultMsg.value = { type: 'err', text: e?.message ?? '读取失败' }
  } finally {
    fetchLoading.value = false
  }
}

async function handleUpdate() {
  if (!fetchedSha.value) {
    resultMsg.value = { type: 'err', text: '请先读取文件获取 sha。' }
    return
  }
  updateLoading.value = true
  try {
    const res = await githubService.updateFile(
      demoPath.value,
      fetchedContent.value,
      fetchedSha.value,
      `Update: demo ${new Date().toLocaleTimeString()}`,
    )
    fetchedSha.value = res.commitSha
    resultMsg.value = {
      type: 'ok',
      text: `已提交 [v${res.version}]`,
    }
  } catch (e: any) {
    resultMsg.value = { type: 'err', text: e?.message ?? '写入失败' }
  } finally {
    updateLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <!-- Top bar -->
    <header class="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 pt-safe">
      <div class="flex items-center justify-between px-4 h-14">
        <h1
          class="text-base font-bold select-none"
          @click="onSecretClick"
        >
          足迹
        </h1>
        <div
          class="text-xs px-2 py-1 rounded-full"
          :class="
            hasConfig
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          "
        >
          {{ hasConfig ? `${owner}/${repo}` : '未配置' }}
        </div>
      </div>
    </header>

    <main class="px-4 py-5 space-y-6 max-w-md mx-auto">
      <!-- Intro -->
      <section class="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-100 dark:border-slate-800">
        <p class="text-sm text-slate-600 dark:text-slate-300">
          欢迎使用足迹 · 个人旅游足迹与规划。数据保存在你的 GitHub 仓库中。
        </p>
        <p class="text-xs text-slate-400 mt-2">
          提示：连续点击顶部「足迹」标题 5 次可打开 GitHub 配置。
        </p>
      </section>

      <!-- Demo: GitHub read/write -->
      <section class="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 class="text-sm font-semibold mb-3">模块 1 · GitHub 读写测试</h2>

        <label class="block text-xs text-slate-500 mb-1">文件路径</label>
        <input
          v-model="demoPath"
          class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500 mb-3"
        />

        <div class="flex gap-2 mb-3">
          <button
            class="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-medium text-white active:bg-brand-700 disabled:opacity-60"
            :disabled="fetchLoading || !hasConfig"
            @click="handleFetch"
          >
            {{ fetchLoading ? '读取中…' : '读取文件' }}
          </button>
          <button
            class="flex-1 rounded-xl border border-brand-600 text-brand-600 py-2 text-sm font-medium active:bg-brand-50 disabled:opacity-60"
            :disabled="updateLoading || !hasConfig"
            @click="handleUpdate"
          >
            {{ updateLoading ? '提交中…' : '提交修改' }}
          </button>
        </div>

        <div
          v-if="resultMsg"
          :class="[
            'text-xs rounded-lg px-3 py-2 mb-3',
            resultMsg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
          ]"
        >
          {{ resultMsg.text }}
        </div>

        <label class="block text-xs text-slate-500 mb-1">文件内容</label>
        <textarea
          v-model="fetchedContent"
          rows="5"
          class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500 no-scrollbar"
          placeholder="读取后在此编辑，然后提交修改…"
        />
      </section>

      <p class="text-center text-xs text-slate-400 pb-safe">
        Mobile-First · GitHub-backed CMS
      </p>
    </main>

    <AuthConfigModal v-model="showConfig" />
  </div>
</template>
