import { cn } from "@/lib/utils"

const colors = [
  "bg-avatar-blue text-avatar-blue-ink",
  "bg-avatar-green text-avatar-green-ink",
  "bg-avatar-amber text-avatar-amber-ink",
  "bg-avatar-rose text-avatar-rose-ink"
]

export function SenderAvatar({ address, className }: { address: string; className?: string }) {
  let hash = 0
  for (const character of address) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0
  const initial = address.trim().replace(/^["'<\s]+/, "").charAt(0).toLocaleUpperCase() || "?"
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", colors[(hash >>> 0) % colors.length], className)}
    >
      {initial}
    </span>
  )
}
