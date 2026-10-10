<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCityLog } from '@/composables/useCityLog'

const props = defineProps<{
  modelValue: boolean
  cityId: string
  logPath: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'appended', version: string): void
}>()

const { appendLog, source } = useCityLog()

const draft = ref('')
const saving = ref(false)
const resultMsg = ref<{ type: 'ok' | 'err'; text: string } | null>(null)

const visible = computed(() => props.modelValue)
const canSave = computed(() => draft.value.trim().length > 0 && !saving.value)
const isLocal = computed(() => source.value === 'local')

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      draft.value = ''
      resultMsg.value = null
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
  if (!canSave.value) return
  saving.value = true
  resultMsg.value = null
  try {
    const version = await appendLog(props.logPath, props.cityId, draft.value)
    resultMsg.value = {
      type: 'ok',
      text: `已追加并提交 [v${version}]`,
    }
    emit('appended', version)
    // Auto close shortly after success
    setTimeout(close, 700)
  } catch (e: any) {
    resultMsg.value = {
      type: 'err',
      text: e?.message ?? '保存失败',
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="visible"
        class="fixed inset-0 z-[60] flex items-end justify-center"
      >
        <div
          class="absolute inset-0 bg-black/60"
          @click="onMaskClick"
        ></div>

        <div
          class="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl pb-safe"
        >
          <div class="flex justify-center pt-3 pb-1">
            <div class="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600"></div>
          </div>

          <div class="px-5 pt-2 pb-5">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
                添加记录
              </h2>
              <button
                class="text-slate-400 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full active:bg-slate-100 dark:active:bg-slate-800"
                @click="close"
              >
                ×
              </button>
            </div>

            <p class="text-xs text-slate-500 mb-3">
              将以「## 日期」标题追加到日志末尾，并提交到 GitHub。
            </p>

            <textarea
              v-model="draft"
              rows="6"
              placeholder="记录今天的见闻、美食或心情…"
              class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 resize-none leading-relaxed"
            ></textarea>

            <div
              v-if="isLocal"
              class="mt-2 text-xs text-amber-600 dark:text-amber-400"
            >
              ⚠️ 当前使用本地示例数据，保存需要先配置 GitHub 凭据（点击状态行 5 次）。
            </div>

            <div
              v-if="resultMsg"
              :class="[
                'mt-3 text-xs rounded-lg px-3 py-2',
                resultMsg.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
              ]"
            >
              {{ resultMsg.text }}
            </div>

            <div class="flex gap-2 mt-4">
              <button
                class="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
                @click="close"
              >
                取消
              </button>
              <button
                class="flex-[1.5] rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-60"
                :disabled="!canSave"
                @click="handleSave"
              >
                {{ saving ? '提交中…' : '保存并提交' }}
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
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
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
