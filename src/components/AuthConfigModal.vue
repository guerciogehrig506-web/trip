<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useConfig } from '@/composables/useConfig'
import { githubService } from '@/composables/githubService'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { pat, owner, repo, branch, saveConfig, clearConfig, hasConfig } =
  useConfig()

const form = reactive({
  pat: pat.value,
  owner: owner.value,
  repo: repo.value,
  branch: branch.value,
})

const saving = ref(false)
const testing = ref(false)
const testMsg = ref<{ type: 'ok' | 'err'; text: string } | null>(null)
const showPat = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.pat = pat.value
      form.owner = owner.value
      form.repo = repo.value
      form.branch = branch.value || 'main'
      testMsg.value = null
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function onMaskClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

async function handleSave() {
  if (!form.pat || !form.owner || !form.repo) {
    testMsg.value = { type: 'err', text: 'PAT、Owner、Repo 不能为空。' }
    return
  }
  saving.value = true
  try {
    saveConfig({
      pat: form.pat.trim(),
      owner: form.owner.trim(),
      repo: form.repo.trim(),
      branch: form.branch.trim() || 'main',
    })
    testMsg.value = { type: 'ok', text: '已保存到本地。' }
    // auto close shortly after save
    setTimeout(close, 600)
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  if (!form.pat || !form.owner || !form.repo) {
    testMsg.value = { type: 'err', text: '请先填写 PAT、Owner、Repo。' }
    return
  }
  // temporarily apply the in-form values so verification uses them
  const prev = { pat: pat.value, owner: owner.value, repo: repo.value, branch: branch.value }
  saveConfig({
    pat: form.pat.trim(),
    owner: form.owner.trim(),
    repo: form.repo.trim(),
    branch: form.branch.trim() || 'main',
  })
  testing.value = true
  testMsg.value = null
  try {
    await githubService.verifyAccess()
    testMsg.value = {
      type: 'ok',
      text: `连接成功：${form.owner}/${form.repo}`,
    }
  } catch (e: any) {
    const status = e?.status ?? ''
    const detail =
      status === 401
        ? 'PAT 无效或已过期。'
        : status === 403
          ? 'PAT 没有该仓库权限，请确认已勾选 Contents 读写。'
          : status === 404
            ? '仓库不存在或无权限访问。'
            : e?.message ?? '连接失败。'
    testMsg.value = { type: 'err', text: `验证失败（${status || 'ERR'}）：${detail}` }
    // rollback so bad values are not persisted
    saveConfig(prev)
  } finally {
    testing.value = false
  }
}

function handleClear() {
  clearConfig()
  form.pat = ''
  form.owner = ''
  form.repo = ''
  form.branch = 'main'
  testMsg.value = { type: 'ok', text: '已清除本地凭据。' }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
        @click="onMaskClick"
      >
        <div
          class="w-full max-w-md rounded-t-3xl bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar pb-safe"
          @click.stop
        >
          <!-- drag handle -->
          <div class="flex justify-center pt-3 pb-1">
            <div class="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600"></div>
          </div>

          <div class="px-5 pt-2 pb-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
                GitHub 配置
              </h2>
              <button
                class="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                @click="close"
              >
                ×
              </button>
            </div>

            <p class="text-xs text-slate-500 mb-4">
              凭据仅保存在当前浏览器 localStorage，不会上传到任何服务器。
              PAT 请勾选 <span class="font-medium">Contents: Read and write</span> 权限。
            </p>

            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Personal Access Token
                </label>
                <div class="relative">
                  <input
                    v-model="form.pat"
                    :type="showPat ? 'text' : 'password'"
                    placeholder="ghp_xxx..."
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 pr-12 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    autocomplete="off"
                  />
                  <button
                    type="button"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 px-2 py-1"
                    @click="showPat = !showPat"
                  >
                    {{ showPat ? '隐藏' : '显示' }}
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Owner（用户名或组织）
                </label>
                <input
                  v-model="form.owner"
                  placeholder="your-name"
                  class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Repo（仓库名）
                </label>
                <input
                  v-model="form.repo"
                  placeholder="travel-footprint"
                  class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  分支（可选，默认 main）
                </label>
                <input
                  v-model="form.branch"
                  placeholder="main"
                  class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </div>

              <div
                v-if="testMsg"
                :class="[
                  'text-xs rounded-lg px-3 py-2',
                  testMsg.type === 'ok'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                ]"
              >
                {{ testMsg.text }}
              </div>

              <div class="flex gap-2 pt-1">
                <button
                  class="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
                  :disabled="testing"
                  @click="handleTest"
                >
                  {{ testing ? '测试中…' : '测试连接' }}
                </button>
                <button
                  class="flex-[1.5] rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-60"
                  :disabled="saving"
                  @click="handleSave"
                >
                  {{ saving ? '保存中…' : '保存' }}
                </button>
              </div>

              <button
                v-if="hasConfig"
                class="w-full text-xs text-slate-400 hover:text-rose-500 pt-1"
                @click="handleClear"
              >
                清除本地凭据
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
}
.sheet-enter-active > div:last-child,
.sheet-leave-active > div:last-child {
  transition: transform 0.25s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from > div:last-child,
.sheet-leave-to > div:last-child {
  transform: translateY(100%);
}
</style>
