import { Header } from "@/components/layout/header"
import { ThreeColumnLayout } from "@/components/emails/three-column-layout"
import { NoPermissionDialog } from "@/components/no-permission-dialog"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import type { Locale } from "@/i18n/config"

export const runtime = "edge"

export default async function MoePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: localeFromParams } = await params
  const locale = localeFromParams as Locale
  const session = await auth()
  
  if (!session?.user) {
    redirect(`/${locale}`)
  }

  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_EMAIL)

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <Header application />
      <main className="min-h-0 flex-1 overflow-hidden">
        <ThreeColumnLayout />
        {!hasPermission && <NoPermissionDialog />}
      </main>
    </div>
  )
}

