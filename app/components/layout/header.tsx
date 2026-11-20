
import { SignButton } from "@/components/auth/sign-button"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { NavLinks } from "@/components/layout/nav-links"
import { Logo } from "@/components/ui/logo"
import { useTranslations } from "next-intl"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

export function Header({ application = false }: { application?: boolean }) {
  const t = useTranslations("workspace")
  return (
    <header className={cn(
      "z-50 border-b bg-background",
      application ? "relative h-appbar shrink-0" : "fixed left-0 right-0 top-0 h-16 bg-background/80 backdrop-blur-sm"
    )}>
      <div className={cn("h-full", application ? "px-2 sm:px-4" : "container mx-auto px-4")}>
        <div className={cn("h-full flex items-center justify-between", application ? "gap-2 sm:gap-4" : "gap-4")}>
          <div className={cn("flex min-w-0 items-center gap-3 lg:gap-6", application && "flex-1 overflow-hidden md:flex-none [&>*]:shrink-0")}>
            <Logo />
            {!application && <NavLinks />}
          </div>
          {application && (
            <div className="relative hidden w-full max-w-xl md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                disabled
                aria-label={t("search")}
                placeholder={t("search")}
                title={t("searchUnavailable")}
                className="h-9 w-full cursor-not-allowed rounded-lg border bg-muted/50 pl-10 pr-3 text-sm placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div className={cn("flex shrink-0 items-center gap-2 sm:gap-3", application && "[&_button]:min-h-10 [&_button]:min-w-10 lg:[&_button]:min-h-0 lg:[&_button]:min-w-0")}>
            <LanguageSwitcher />
            <ThemeToggle />
            <SignButton />
          </div>
        </div>
      </div>
    </header>
  )
}
