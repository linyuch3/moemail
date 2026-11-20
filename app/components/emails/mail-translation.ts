export interface TranslatableMail {
  subject: string
  content: string
  html?: string
}

export interface MailTranslation {
  subject: string
  content: string
  html?: string
  failedChunks: number
  processedChars: number
  totalChars: number
  truncated: boolean
}

const memory = new Map<string, { original: string; result: MailTranslation }>()

function storageKey(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return `moemail:translation:${hash >>> 0}`
}

export async function translateMail(
  mail: TranslatableMail,
  identity: string,
  targetLang: string,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void
): Promise<MailTranslation> {
  const original = JSON.stringify([identity, targetLang, mail])
  const key = storageKey(original)
  let cached = memory.get(key)
  try {
    if (!cached) cached = JSON.parse(sessionStorage.getItem(key) || "null")
  } catch { /* Storage may be unavailable or full. */ }
  if (cached?.original === original) return cached.result
  const result: MailTranslation = {
    subject: mail.subject, content: mail.content, html: mail.html,
    failedChunks: 0, processedChars: 0, totalChars: 0, truncated: false
  }
  const tasks: { text: string; apply: (text: string) => void }[] = []
  if (mail.subject.trim()) tasks.push({ text: mail.subject, apply: text => { result.subject = text } })
  if (mail.content.trim()) tasks.push({ text: mail.content, apply: text => { result.content = text } })
  const document = mail.html ? new DOMParser().parseFromString(mail.html, "text/html") : null
  if (document) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const textNode = node
      if (!textNode.textContent?.trim() ||
          textNode.parentElement?.closest("script,style,code,pre,noscript,[translate='no']")) continue
      tasks.push({ text: textNode.textContent, apply: text => { textNode.textContent = text } })
    }
  }
  let completed = 0
  let next = 0
  onProgress(0, tasks.length)
  await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
    while (next < tasks.length) {
      signal.throwIfAborted()
      const task = tasks[next++]
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: task.text, targetLang }),
        signal
      })
      const data = await response.json() as Partial<MailTranslation> & { translatedText?: string; error?: string }
      if (!response.ok || typeof data.translatedText !== "string") {
        throw new Error(data.error || "Translation request failed")
      }
      task.apply(data.translatedText)
      result.failedChunks += data.failedChunks || 0
      result.processedChars += data.processedChars ?? task.text.length
      result.totalChars += data.totalChars ?? task.text.length
      result.truncated ||= Boolean(data.truncated)
      onProgress(++completed, tasks.length)
    }
  }))
  signal.throwIfAborted()
  if (document) result.html = document.documentElement.outerHTML
  // 部分失败不缓存，允许下次点击重新尝试；成功缓存按邮件原文校验。
  if (!result.failedChunks && !result.truncated) {
    const entry = { original, result }
    if (memory.size >= 20) memory.delete(memory.keys().next().value as string)
    memory.set(key, entry)
    try {
      const keys = Object.keys(sessionStorage).filter(value => value.startsWith("moemail:translation:"))
      while (keys.length >= 10) sessionStorage.removeItem(keys.shift()!)
      sessionStorage.setItem(key, JSON.stringify(entry))
    } catch { /* The bounded in-memory cache remains usable. */ }
  }
  return result
}
