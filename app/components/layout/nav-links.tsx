"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useSession } from "next-auth/react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

export function NavLinks() {
  const t = useTranslations("common.nav")
  const locale = useLocale()
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false)
        menuRef.current?.querySelector("button")?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  if (status === "loading" || !session?.user) {
    return null
  }

  const items = [
    { href: `/${locale}/moe`, label: t("mailbox") },
    { href: `/${locale}/domains`, label: t("domains") },
    { href: `/${locale}/api-docs`, label: t("api") },
    { href: `/${locale}/profile`, label: t("profile") },
  ]

  return (
    <>
      <nav className="hidden items-center gap-0.5 sm:flex">
        {items.map(item => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <nav ref={menuRef} className="shrink-0 sm:hidden">
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(open => !open)}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
        {isOpen && (
          <div className="absolute inset-x-4 top-full z-[60] mt-2 rounded-lg border bg-background p-1 shadow-lg">
            {items.map(item => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>
    </>
  )
}
