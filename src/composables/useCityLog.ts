import { ref } from 'vue'
import { githubService } from './githubService'
import { useConfig } from './useConfig'

const content = ref<string>('')
const sha = ref<string>('')
const loading = ref(false)
const error = ref<string | null>(null)
const source = ref<'github' | 'local'>('local')

/**
 * Load the markdown log for a city. If GitHub is configured, fetch from the
 * repository; otherwise fall back to the bundled sample under /logs/.
 */
async function loadLog(path: string): Promise<void> {
  if (!path) return
  loading.value = true
  error.value = null
  const { hasConfig } = useConfig()

  try {
    if (hasConfig.value) {
      const file = await githubService.fetchFile(path)
      content.value = file.content
      sha.value = file.sha
      source.value = 'github'
    } else {
      const res = await fetch(`/${path}`)
      if (!res.ok) throw new Error(`本地日志不存在：${path}`)
      content.value = await res.text()
      sha.value = ''
      source.value = 'local'
    }
  } catch (e: any) {
    error.value = e?.message ?? '加载日志失败'
    content.value = ''
    sha.value = ''
    // Try local fallback when GitHub fetch fails
    if (source.value === 'github') {
      try {
        const res = await fetch(`/${path}`)
        if (res.ok) {
          content.value = await res.text()
          source.value = 'local'
          error.value = null
        }
      } catch {
        /* keep error */
      }
    }
  } finally {
    loading.value = false
  }
}

/**
 * Append new text to the city's markdown log. The new entry is formatted with
 * a date heading and written back to GitHub via the single-file contents API.
 * Returns the generated version string.
 */
async function appendLog(
  path: string,
  cityId: string,
  text: string,
): Promise<string> {
  if (!text.trim()) throw new Error('内容不能为空')

  const trimmed = text.trim()
  const dateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const entry = `\n## ${dateStr}\n\n${trimmed}\n`
  const newContent = (content.value || '') + entry

  const res = await githubService.updateFile(
    path,
    newContent,
    sha.value,
    `Append: log to ${cityId}`,
  )

  content.value = newContent
  sha.value = res.contentSha
  return res.version
}

export function useCityLog() {
  return {
    content,
    sha,
    loading,
    error,
    source,
    loadLog,
    appendLog,
  }
}
