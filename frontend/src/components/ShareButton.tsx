import { Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"

export function ShareButton({ shareId }: { shareId: string }) {
  const { t } = useI18n()
  async function share() {
    const url = `${window.location.origin}/r/${shareId}`
    const data = { title: t("share.title"), text: t("share.text"), url }
    try {
      if (navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data) // native share sheet on phones
      } else {
        await navigator.clipboard.writeText(url)
        toast.success(t("share.copied"))
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(t("share.failed", { url }))
    }
  }
  return (
    <Button
      onClick={share}
      className="h-14 rounded-[22px] px-7 text-base font-bold shadow-[0_10px_30px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
    >
      <Share2 aria-hidden /> {t("share.btn")}
    </Button>
  )
}
