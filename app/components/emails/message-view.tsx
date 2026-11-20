
"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations, useLocale } from "next-intl"
import { AlertCircle, Check, Copy, Languages, Loader2, Share2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useTheme } from "next-themes"
import { useCopy } from "@/hooks/use-copy"
import { useToast } from "@/components/ui/use-toast"
import { ShareMessageDialog } from "./share-message-dialog"
import { SenderAvatar } from "./sender-avatar"
import { translateMail, type MailTranslation } from "./mail-translation"

interface Message {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  content: string
  html?: string
  received_at?: number
  sent_at?: number
}

interface MessageViewProps {
  emailId: string
  messageId: string
  messageType?: 'received' | 'sent'
  onClose: () => void
}

type ViewMode = "html" | "text"

// 纯前端提取验证码：优先匹配带关键字的 4-8 位数字
function extractVerificationCode(message: Message | null): string | null {
  if (!message) return null
  const raw = `${message.subject || ""} ${message.content || ""} ${message.html || ""}`
  const text = raw.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  if (!text) return null

  const keywordPatterns = [
    /(?:verification|verify|security|confirmation|one[-\s]?time|passcode|otp|code)\D{0,16}(\d{4,8})/i,
    /(\d{4,8})\D{0,16}(?:is your|is the)?\s*(?:verification|verify|security|confirmation|one[-\s]?time|passcode|otp|code)/i,
    /(?:验证码|校验码|动态码|口令|代码|認証コード|인증\s?코드)\D{0,16}(\d{4,8})/,
    /(\d{4,8})\D{0,12}(?:为您的?|是您的?)?\s*(?:验证码|校验码|动态码|認証コード|인증\s?코드)/
  ]

  for (const pattern of keywordPatterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }

  // 短邮件（通常是验证类邮件）才回退到任意 4-8 位数字
  if (text.length <= 400) {
    const standalone = text.match(/(?:^|[^\d])(\d{4,8})(?!\d)/)
    if (standalone?.[1]) return standalone[1]
  }

  return null
}

export function MessageView({ emailId, messageId, messageType = 'received' }: MessageViewProps) {
  const t = useTranslations("emails.messageView")
  const tList = useTranslations("emails.list")
  const locale = useLocale()
  const tWorkspace = useTranslations("workspace")
  const targetLang = locale
  const [message, setMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("html")
  const [copied, setCopied] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translation, setTranslation] = useState<MailTranslation | null>(null)
  const [showingTranslation, setShowingTranslation] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [srcDoc, setSrcDoc] = useState("")
  const translationController = useRef<AbortController | null>(null)
  const loadSequence = useRef(0)
  const { resolvedTheme } = useTheme()
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()
  const translatedSubject = showingTranslation ? translation?.subject : null
  const translatedContent = showingTranslation ? translation?.content : null
  const displayHtml = showingTranslation ? translation?.html : message?.html

  useEffect(() => {
    const sequence = ++loadSequence.current
    const controller = new AbortController()
    translationController.current?.abort()
    setTranslating(false)
    setShowingTranslation(false)
    setTranslation(null)
    const fetchMessage = async () => {
      try {
        setLoading(true)
        setError(null)

        const url = `/api/emails/${emailId}/${messageId}${messageType === 'sent' ? '?type=sent' : ''}`

        const response = await fetch(url, { signal: controller.signal })
        if (sequence !== loadSequence.current) return

        if (!response.ok) {
          const errorData = await response.json()
          const errorMessage = (errorData as { error?: string }).error || t("loadError")
          setError(errorMessage)
          toast({
            title: tList("error"),
            description: errorMessage,
            variant: "destructive"
          })
          return
        }

        const data = await response.json() as { message: Message }
        if (sequence !== loadSequence.current) return
        setMessage(data.message)
        setViewMode(data.message.html ? "html" : "text")
      } catch (error) {
        if (controller.signal.aborted || sequence !== loadSequence.current) return
        const errorMessage = t("networkError")
        setError(errorMessage)
        toast({
          title: tList("error"),
          description: errorMessage,
          variant: "destructive"
        })
        console.error("Failed to fetch message:", error)
      } finally {
        if (sequence === loadSequence.current) setLoading(false)
      }
    }

    fetchMessage()
    return () => {
      controller.abort()
      translationController.current?.abort()
    }
  }, [emailId, messageId, messageType, toast, t, tList])

  const code = extractVerificationCode(message)

  useEffect(() => {
    if (!displayHtml) {
      setSrcDoc("")
      return
    }
    const parsedDocument = new DOMParser().parseFromString(displayHtml, "text/html")
    parsedDocument.querySelectorAll("base,script").forEach(element => element.remove())
    const base = parsedDocument.createElement("base")
    base.target = "_blank"
    parsedDocument.head.insertBefore(base, parsedDocument.head.firstChild)
    const tokens = getComputedStyle(window.document.documentElement)
    const color = (name: string) => `hsl(${tokens.getPropertyValue(name).trim()})`
    const style = parsedDocument.createElement("style")
    // HTML 邮件作为独立“纸张”保留原始背景/前景，不做局部反色。
    // 无自带颜色时使用成对的 mail-paper/mail-ink；暗色外壳不会污染邮件。
    // 基底置于邮件 CSS 之前，让发件人的显式排版和颜色继续生效。
    style.textContent = `
      :root { color-scheme: light; }
      html { margin: 0; padding: 0; background: ${color("--mail-paper")}; }
      body {
        margin: 0; padding: 16px; min-height: 100%;
        font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: ${tokens.getPropertyValue("--font-body").trim()};
        line-height: 1.6; color: ${color("--mail-ink")};
        background: ${color("--mail-paper")}; overflow-wrap: anywhere;
      }
      img { max-width: 100%; height: auto; }
      a { color: ${color("--primary")}; text-decoration: underline; }
      p { margin: 0 0 1em; }
      pre { overflow: auto; white-space: pre-wrap; padding: 12px; background: ${color("--mail-code")}; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      code { font-size: .95em; }
      table { max-width: 100%; border-collapse: collapse; }
      th, td { vertical-align: top; }
      blockquote { margin: 16px 0; padding-left: 16px; border-left: 3px solid ${color("--border")}; }
    `
    parsedDocument.head.insertBefore(style, parsedDocument.head.firstChild)
    setSrcDoc(`<!DOCTYPE html>${parsedDocument.documentElement.outerHTML}`)
  }, [displayHtml, resolvedTheme])

  const handleTranslate = async () => {
    if (!message || translating) return
    if (showingTranslation) {
      setShowingTranslation(false)
      return
    }
    if (translation && !translation.failedChunks && !translation.truncated) {
      setShowingTranslation(true)
      return
    }
    const controller = new AbortController()
    translationController.current?.abort()
    translationController.current = controller
    setTranslating(true)
    setProgress({ completed: 0, total: 0 })
    try {
      const result = await translateMail(message, `${emailId}/${messageType}/${messageId}`, targetLang, controller.signal,
        (completed, total) => {
          if (!controller.signal.aborted) setProgress({ completed, total })
        })
      if (controller.signal.aborted) return
      setTranslation(result)
      setShowingTranslation(true)
    } catch (error) {
      if (controller.signal.aborted) return
      toast({
        title: tList("error"),
        description: error instanceof Error ? error.message : t("translateFailed"),
        variant: "destructive"
      })
    } finally {
      if (!controller.signal.aborted) setTranslating(false)
    }
  }

  const handleCopyCode = async () => {
    if (!code) return
    const success = await copyToClipboard(code)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-16">
        <Loader2 className="size-5 animate-spin text-primary/70" />
        <span className="text-xs text-muted-foreground">{t("loading")}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-5" />
        </div>
        <p className="max-w-[280px] text-xs leading-relaxed text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-10 text-xs lg:h-7"
          onClick={() => window.location.reload()}
        >
          {t("retry")}
        </Button>
      </div>
    )
  }

  if (!message) return null

  return (
    <div className="mx-auto flex h-full w-full min-w-0 max-w-mail-body flex-col overflow-hidden">
      <div className="min-w-0 shrink-0 space-y-4 border-b p-4">
        <div className="flex min-w-0 flex-col items-start justify-between gap-2 sm:flex-row">
          <h3 className="min-w-0 max-w-full flex-1 whitespace-normal text-xl font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
            {translatedSubject ?? message.subject}
          </h3>
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-0.5 [&_button]:min-h-10 [&_button]:min-w-10 lg:[&_button]:min-h-0 lg:[&_button]:min-w-0">
            {message.html && message.content && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                aria-label={viewMode === "html" ? t("textFormat") : t("htmlFormat")}
                title={viewMode === "html" ? t("textFormat") : t("htmlFormat")}
                onClick={() => setViewMode(mode => mode === "html" ? "text" : "html")}
              >
                {viewMode === "html" ? "HTML" : "TXT"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", showingTranslation ? "text-primary" : "text-muted-foreground")}
              aria-label={showingTranslation ? t("showOriginal") : tWorkspace("translate")}
              title={showingTranslation ? t("showOriginal") : tWorkspace("translate")}
              disabled={translating}
              onClick={handleTranslate}
            >
              {translating ? <Loader2 className="size-3.5 animate-spin" /> : <Languages className="size-3.5" />}
            </Button>
            <ShareMessageDialog
              emailId={emailId}
              messageId={message.id}
              messageSubject={message.subject}
              trigger={
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                  <Share2 className="size-3.5" />
                </Button>
              }
            />
          </div>
        </div>

        {code && (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border-l-2 border-primary bg-primary/10 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {t("codeLabel")}
              </p>
              <p className="font-mono text-xl font-semibold tabular-nums tracking-widest">{code}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-10 max-w-full shrink-0 gap-1.5 whitespace-normal text-xs lg:h-7 lg:min-h-0"
              onClick={handleCopyCode}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? t("codeCopied") : t("copyCode")}
            </Button>
          </div>
        )}

        <div className="flex items-start gap-3">
          <SenderAvatar address={message.from_address || message.to_address || ""} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 max-w-full break-all text-sm font-semibold">
                {message.from_address || "—"}
              </span>
              <time className="min-w-0 max-w-full whitespace-normal text-xs tabular-nums text-muted-foreground [overflow-wrap:anywhere]">
                {new Date(message.sent_at || message.received_at || 0).toLocaleString(locale)}
              </time>
            </div>
            {message.to_address && (
              <p className="break-all text-xs text-muted-foreground">
                {t("to")} · {message.to_address}
              </p>
            )}
          </div>
        </div>
      </div>

      {translating && (
        <div role="status" aria-live="polite" className="flex min-w-0 shrink-0 items-center gap-2 border-b bg-primary/10 px-4 py-2 text-xs [overflow-wrap:anywhere]">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          {tWorkspace("progress", progress)}
        </div>
      )}
      {showingTranslation && translation && (
        <div role="status" className="min-w-0 shrink-0 space-y-1 border-b bg-primary/10 px-4 py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          <p>{t("translatedHint")}</p>
          {translation.failedChunks > 0 && <p>{tWorkspace("partial", { count: translation.failedChunks })}</p>}
          {translation.truncated && <p>{tWorkspace("truncated", { count: translation.processedChars })}</p>}
        </div>
      )}

      <div className="relative min-h-0 min-w-0 flex-1 overflow-auto">
        {viewMode === "html" && displayHtml ? (
          <iframe
            title={translatedSubject || message.subject || t("htmlFormat")}
            srcDoc={srcDoc}
            className="absolute inset-0 h-full w-full border-0 bg-transparent"
            sandbox="allow-same-origin allow-popups"
          />
        ) : (
          <div className="min-w-0 max-w-full whitespace-pre-wrap p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
            {translatedContent ?? message.content}
          </div>
        )}
      </div>
    </div>
  )
}

