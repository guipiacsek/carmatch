import { Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function ShareButton({ shareId }: { shareId: string }) {
  async function share() {
    const url = `${window.location.origin}/r/${shareId}`
    const data = { title: "My CarMatch results", text: "Cars that fit what I'm looking for:", url }
    try {
      if (navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data) // native share sheet on phones
      } else {
        await navigator.clipboard.writeText(url)
        toast.success("Link copied. It works for 7 days.")
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(`Couldn't share automatically. Here's the link: ${url}`)
    }
  }
  return (
    <Button
      onClick={share}
      className="h-14 rounded-[22px] px-7 text-base font-bold shadow-[0_10px_30px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
    >
      <Share2 aria-hidden /> Share
    </Button>
  )
}
