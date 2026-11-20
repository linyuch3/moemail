import { NextResponse } from "next/server"

export const runtime = "edge"

const MAX_TEXT_LENGTH = 20000
const CHUNK_BYTES = 450
const UPSTREAM_TIMEOUT_MS = 15000
const encoder = new TextEncoder()
const cache = new Map<string, { value: string; expires: number }>()
const languages = new Set(["zh-CN", "zh-TW", "en", "ja", "ko"])

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = []
  // 占位符不可拆开；u 模式保证不会拆开 UTF-16 代理对。
  const tokens = text.match(/__MOEMAIL_\d+__|[\s\S]/gu) || []
  let chunk = ""
  let bytes = 0
  for (const token of tokens) {
    const size = encoder.encode(token).byteLength
    if (bytes + size > CHUNK_BYTES && chunk) {
      chunks.push(chunk)
      chunk = ""
      bytes = 0
    }
    chunk += token
    bytes += size
    // 优先在段落/句末收束；无边界的长句才使用字节上限。
    if (token === "\n" || (bytes >= 180 && /[。！？.!?;；]/u.test(token))) {
      chunks.push(chunk)
      chunk = ""
      bytes = 0
    }
  }
  if (chunk) chunks.push(chunk)
  return chunks
}

async function translateChunk(text: string, target: string, endpoint: string, key: string, contact: string): Promise<string> {
  const leading = text.match(/^\s*/u)?.[0] || ""
  const trailing = text.match(/\s*$/u)?.[0] || ""
  const input = text.trim()
  if (!input) return text
  const cacheKey = JSON.stringify([endpoint, target, input])
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return leading + hit.value + trailing
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    // TRANSLATE_API_URL 接受 MyMemory GET 协议兼容的认证网关。
    const url = new URL(endpoint)
    url.searchParams.set("q", input)
    url.searchParams.set("langpair", `auto|${target}`)
    url.searchParams.set("key", key)
    if (contact) url.searchParams.set("de", contact)
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" })
    if (!response.ok) throw new Error(`upstream ${response.status}`)
    const data = await response.json() as {
      responseData?: { translatedText?: string }
      responseStatus?: number | string
      responseDetails?: string
    }
    const translated = data.responseData?.translatedText
    if (typeof translated !== "string" || !translated.trim() ||
        (data.responseStatus !== undefined && Number(data.responseStatus) !== 200) ||
        /MYMEMORY WARNING|QUERY LENGTH|QUOTA|EXCEEDED|USED ALL AVAILABLE|NEXT AVAILABLE/i.test(`${translated} ${data.responseDetails || ""}`)) {
      throw new Error("invalid upstream translation")
    }
    const expected = input.match(/__MOEMAIL_\d+__/g) || []
    const actual = translated.match(/__MOEMAIL_\d+__/g) || []
    if (expected.length !== actual.length || expected.some(token => actual.filter(value => value === token).length !== 1)) {
      throw new Error("translation damaged protected values")
    }
    if (cache.size >= 128) cache.delete(cache.keys().next().value as string)
    cache.set(cacheKey, { value: translated, expires: Date.now() + 300000 })
    return leading + translated + trailing
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  let payload: { text?: unknown; targetLang?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const { text, targetLang = "zh-CN" } = payload
  if (typeof text !== "string" || !text.trim() || typeof targetLang !== "string" || !languages.has(targetLang)) {
    return NextResponse.json({ error: "Invalid text or targetLang" }, { status: 400 })
  }
  const endpoint = process.env.TRANSLATE_API_URL || "https://api.mymemory.translated.net/get"
  const key = process.env.TRANSLATE_API_KEY || ""
  const contact = process.env.TRANSLATE_CONTACT_EMAIL || ""
  // 不使用伪造 de 或共享 IP 匿名额度；配置缺失必须明确失败。
  if (!key || (!process.env.TRANSLATE_API_URL && !contact)) {
    return NextResponse.json({ error: "Translation credentials are not configured" }, { status: 503 })
  }
  const input = text.slice(0, MAX_TEXT_LENGTH).replace(/[\uD800-\uDBFF]$/u, "")
  const protectedValues: string[] = []
  const protectedText = input.replace(/__MOEMAIL_\d+__|https?:\/\/[^\s<>"']+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\d(?:[\d -]*\d)?/gi, value => {
    protectedValues.push(value)
    return `__MOEMAIL_${protectedValues.length - 1}__`
  })
  const chunks = splitIntoChunks(protectedText)
  let failedChunks = 0
  const out = new Array<string>(chunks.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
    while (next < chunks.length) {
      const index = next++
      const chunk = chunks[index]
      out[index] = chunk
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          out[index] = await translateChunk(chunk, targetLang, endpoint, key, contact)
          break
        } catch {
          if (attempt === 1) failedChunks++
        }
      }
    }
  }))
  const translatedText = out.join("").replace(/__MOEMAIL_(\d+)__/g, (_, index: string) => protectedValues[Number(index)]) + text.slice(input.length)
  return NextResponse.json({ translatedText, failedChunks, processedChars: input.length, totalChars: text.length, truncated: input.length < text.length })
}
