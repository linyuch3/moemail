
"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Inbox, RefreshCw, Send, Share2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
import { ShareMessageDialog } from "./share-message-dialog"
import { SenderAvatar } from "./sender-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"

interface Message {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  received_at?: number
  sent_at?: number
  content?: string
  html?: string
}

interface MessageListProps {
  email: {
    id: string
    address: string
  }
  messageType: 'received' | 'sent'
  onMessageSelect: (messageId: string | null, messageType?: 'received' | 'sent') => void
  selectedMessageId?: string | null
  refreshTrigger?: number
  toolbarLeading?: ReactNode
}

interface MessageResponse {
  messages: Message[]
  nextCursor: string | null
  total: number
}

function buildPreview(message: Message) {
  const raw = message.content || message.html || ""
  if (!raw) return ""
  return raw
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" })
  }
  return date.toLocaleDateString()
}

export function MessageList({ email, messageType, onMessageSelect, selectedMessageId, refreshTrigger, toolbarLeading }: MessageListProps) {
  const t = useTranslations("emails.messages")
  const tList = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const pollTimeoutRef = useRef<Timer>(null)
  const messagesRef = useRef<Message[]>([]) // 添加 ref 来追踪最新的消息列表
  const [total, setTotal] = useState(0)
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null)
  const { toast } = useToast()

  // 当 messages 改变时更新 ref
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const fetchMessages = async (cursor?: string) => {
    try {
      const url = new URL(`/api/emails/${email.id}`, window.location.origin)
      if (messageType === 'sent') {
        url.searchParams.set('type', 'sent')
      }
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }
      const response = await fetch(url)
      const data = await response.json() as MessageResponse

      if (!cursor) {
        const newMessages = data.messages
        const oldMessages = messagesRef.current

        const lastDuplicateIndex = newMessages.findIndex(
          newMsg => oldMessages.some(oldMsg => oldMsg.id === newMsg.id)
        )

        if (lastDuplicateIndex === -1) {
          setMessages(newMessages)
          setNextCursor(data.nextCursor)
          setTotal(data.total)
          return
        }
        const uniqueNewMessages = newMessages.slice(0, lastDuplicateIndex)
        setMessages([...uniqueNewMessages, ...oldMessages])
        setTotal(data.total)
        return
      }
      setMessages(prev => [...prev, ...data.messages])
      setNextCursor(data.nextCursor)
      setTotal(data.total)
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }

  const startPolling = () => {
    stopPolling()
    pollTimeoutRef.current = setInterval(() => {
      if (!refreshing && !loadingMore) {
        fetchMessages()
      }
    }, EMAIL_CONFIG.POLL_INTERVAL)
  }

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
      clearInterval(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchMessages()
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold && nextCursor) {
      setLoadingMore(true)
      fetchMessages(nextCursor)
    }
  }, 200)

  const handleDelete = async (message: Message) => {
    try {
      const response = await fetch(`/api/emails/${email.id}/${message.id}${messageType === 'sent' ? '?type=sent' : ''}`, {
        method: "DELETE"
      })

      if (!response.ok) throw new Error("Failed to delete message")

      setMessages(prev => prev.filter(e => e.id !== message.id))
      setTotal(prev => prev - 1)
      if (selectedMessageId === message.id) {
        onMessageSelect(null, messageType)
      }

      toast({
        title: tList("success"),
        description: tList("deleteSuccess")
      })

    } catch (error) {
      console.error("Failed to delete message:", error)
      toast({
        title: tList("error"),
        description: tList("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      setMessageToDelete(null)
    }
  }

  useEffect(() => {
    if (!email.id) {
      return
    }
    setLoading(true)
    setNextCursor(null)
    fetchMessages()
    startPolling()

    return () => {
      stopPolling()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id])

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      setRefreshing(true)
      fetchMessages()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  return (
  <>
    <div className="flex h-full min-w-0 flex-col [&_button]:min-h-10 [&_button]:min-w-10 lg:[&_button]:min-h-0 lg:[&_button]:min-w-0">
      <div className="mail-panel-header">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {toolbarLeading && <div className="min-w-0 flex-1 lg:min-w-[120px]">{toolbarLeading}</div>}
          <span className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">
            {total} {t("messageCount")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={handleRefresh}
          aria-label="refresh"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" onScroll={handleScroll}>
        {loading ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex h-16 items-center gap-3 px-3">
                <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length > 0 ? (
          <div>
            {messages.map(message => {
              const isSelected = selectedMessageId === message.id
              const preview = buildPreview(message)
              const counterpart = messageType === 'sent'
                ? (message.to_address || '')
                : (message.from_address || '')

              return (
                <div
                  key={message.id}
                  role="button"
                  tabIndex={0}
                  data-selected={isSelected}
                  onClick={() => onMessageSelect(message.id, messageType)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onMessageSelect(message.id, messageType)
                    }
                  }}
                  className={cn(
                    "mail-row group relative flex h-16 min-h-16 shrink-0 items-center gap-3 border-b border-b-border/60"
                  )}
                >
                  <SenderAvatar address={counterpart} />
                  <div className="min-w-0 flex-1 pr-[84px] lg:pr-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span data-unread="true" className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="truncate">{counterpart || "—"}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatTimestamp(message.received_at || message.sent_at || 0)}
                    </span>
                  </div>

                  <div className="flex h-5 items-center justify-between gap-2">
                    <span data-unread="true" className="truncate text-sm leading-tight tracking-tight">
                      {message.subject || t("noSubject")}
                    </span>
                    <span
                      className="mail-row-actions absolute right-3 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5 lg:static lg:translate-y-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ShareMessageDialog
                        emailId={email.id}
                        messageId={message.id}
                        messageSubject={message.subject}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                          >
                            <Share2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title={tCommon("delete")}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMessageToDelete(message)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </div>

                  {preview && (
                    <p className="block truncate text-xs leading-tight text-muted-foreground">
                      {preview}
                    </p>
                  )}
                  </div>
                </div>
              )
            })}
            {loadingMore && (
              <div className="py-2 text-center text-xs text-muted-foreground">{t("loadingMore")}</div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {messageType === 'sent' ? <Send className="size-4" /> : <Inbox className="size-4" />}
            </div>
            <p className="text-xs text-muted-foreground">{t("noMessages")}</p>
          </div>
        )}
      </div>
    </div>
    <AlertDialog open={!!messageToDelete} onOpenChange={() => setMessageToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tList("deleteConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {tList("deleteDescription", { email: messageToDelete?.subject || "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => messageToDelete && handleDelete(messageToDelete)}
          >
            {tCommon("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}

