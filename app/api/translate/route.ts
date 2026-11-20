import { NextResponse } from "next/server"

export const runtime = "edge"

const MAX_TEXT_LENGTH = 20000
const CHUNK_BYTES = 450
const UPSTREAM_TIMEOUT_MS = 15000
const MYMEMORY_CONTACT_EMAIL = "translate@musin.tech"
const DEFAULT_TRANSLATE_ENDPOINT = "https://mm.hailizi.de/get?token=f587c5d6deb37827ae67ebcfbe019705"
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

function detectSourceLanguage(text: string): string {
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return "ja"
  if (/\p{Script=Hangul}/u.test(text)) return "ko"
  if (/\p{Script=Han}/u.test(text)) return "zh-CN"
  if (/\p{Script=Cyrillic}/u.test(text)) return "ru"
  if (/\p{Script=Arabic}/u.test(text)) return "ar"
  if (/\p{Script=Hebrew}/u.test(text)) return "he"
  if (/\p{Script=Greek}/u.test(text)) return "el"
  if (/\p{Script=Devanagari}/u.test(text)) return "hi"
  if (/\p{Script=Thai}/u.test(text)) return "th"
  return "en"
}

async function translateChunk(text: string, target: string, endpoint: string, key: string, contact: string, hasCustomEndpoint: boolean): Promise<string> {
  const leading = text.match(/^\s*/u)?.[0] || ""
  const trailing = text.match(/\s*$/u)?.[0] || ""
  const input = text.trim()
  if (!input) return text
  const source = detectSourceLanguage(input)
  if (source === target) return text
  const cacheKey = JSON.stringify([endpoint, target, input])
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return leading + hit.value + trailing
  const requestTranslation = async (google: boolean): Promise<string> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    try {
      const url = new URL(google ? "https://translate.googleapis.com/translate_a/single" : endpoint)
      url.searchParams.set("q", input)
      if (google) {
        url.searchParams.set("client", "gtx")
        url.searchParams.set("sl", "auto")
        url.searchParams.set("tl", target)
        url.searchParams.set("dt", "t")
      } else {
        url.searchParams.set("langpair", `${source}|${target}`)
        if (hasCustomEndpoint) {
          url.searchParams.set("key", key)
          if (contact) url.searchParams.set("de", contact)
        } else {
          url.searchParams.set("de", MYMEMORY_CONTACT_EMAIL)
        }
      }
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" })
      if (google ? response.status !== 200 : !response.ok) throw new Error(`upstream ${response.status}`)
      const data: unknown = await response.json()
      let translated: string
      if (google) {
        if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("invalid upstream translation")
        translated = data[0].map((segment: unknown) => {
          if (!Array.isArray(segment) || typeof segment[0] !== "string") {
            throw new Error("invalid upstream translation")
          }
          return segment[0]
        }).join("")
        if (!translated.trim()) throw new Error("invalid upstream translation")
      } else {
        const result = data as {
          responseData?: { translatedText?: string }
          responseStatus?: number | string
          responseDetails?: string
        }
        const value = result?.responseData?.translatedText
        if (typeof value !== "string" || !value.trim() ||
            (result.responseStatus !== undefined && Number(result.responseStatus) !== 200) ||
            /MYMEMORY WARNING|QUERY LENGTH|QUOTA|EXCEEDED|USED ALL AVAILABLE|NEXT AVAILABLE/i.test(`${value} ${result.responseDetails || ""}`)) {
          throw new Error("invalid upstream translation")
        }
        translated = value
      }
      const expected = input.match(/__MOEMAIL_\d+__/g) || []
      const actual = translated.match(/__MOEMAIL_\d+__/g) || []
      if (expected.length !== actual.length || expected.some(token => actual.filter(value => value === token).length !== 1)) {
        throw new Error("translation damaged protected values")
      }
      return translated
    } finally {
      clearTimeout(timer)
    }
  }
  let translated: string
  if (hasCustomEndpoint) {
    translated = await requestTranslation(false)
  } else {
    try {
      translated = await requestTranslation(false)
    } catch {
      translated = await requestTranslation(true)
    }
  }
  if (cache.size >= 128) cache.delete(cache.keys().next().value as string)
  cache.set(cacheKey, { value: translated, expires: Date.now() + 300000 })
  return leading + translated + trailing
}

export async function POST(request: Request) {
  let payload: { text?: unknown; targetLang?: unknown; debug?: boolean }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const { text, targetLang = "zh-CN", debug } = payload
  if (typeof text !== "string" || !text.trim() || typeof targetLang !== "string" || !languages.has(targetLang)) {
    return NextResponse.json({ error: "Invalid text or targetLang" }, { status: 400 })
  }
  const configuredEndpoint = process.env.TRANSLATE_API_URL || ""
  const hasCustomEndpoint = Boolean(configuredEndpoint)
  const endpoint = configuredEndpoint || DEFAULT_TRANSLATE_ENDPOINT
  const key = process.env.TRANSLATE_API_KEY || ""
  const contact = process.env.TRANSLATE_CONTACT_EMAIL || ""
  const input = text.slice(0, MAX_TEXT_LENGTH).replace(/[\uD800-\uDBFF]$/u, "")
  const protectedValues: string[] = []
  const protectedText = input.replace(/__MOEMAIL_\d+__|https?:\/\/[^\s<>"']+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\d(?:[\d -]*\d)?/gi, value => {
    protectedValues.push(value)
    return `__MOEMAIL_${protectedValues.length - 1}__`
  })
  const chunks = splitIntoChunks(protectedText)
  let failedChunks = 0
  const debugErrors: string[] = []
  const out = new Array<string>(chunks.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
    while (next < chunks.length) {
      const index = next++
      const chunk = chunks[index]
      out[index] = chunk
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          out[index] = await translateChunk(chunk, targetLang, endpoint, key, contact, hasCustomEndpoint)
          break
        } catch (error) {
          if (debug === true && debugErrors.length < 6) debugErrors.push((error instanceof Error ? error.message : String(error)).slice(0, 200))
          if (attempt === 1) failedChunks++
        }
      }
    }
  }))
  const translatedText = out.join("").replace(/__MOEMAIL_(\d+)__/g, (_, index: string) => protectedValues[Number(index)]) + text.slice(input.length)
  return NextResponse.json({ translatedText, failedChunks, processedChars: input.length, totalChars: text.length, truncated: input.length < text.length, ...(debug === true ? { debugErrors } : {}) })
}
