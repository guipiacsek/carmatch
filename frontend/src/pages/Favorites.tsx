import { Link } from "react-router-dom"

import { ResultList } from "@/components/ResultList"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MAX_FAVORITES, useAccount } from "@/hooks/account"
import { useI18n } from "@/i18n"

export default function Favorites() {
  const { enabled, user, favorites, favoritesLoading, openAuth } = useAccount()
  const { t } = useI18n()

  let body
  if (!enabled) body = <p>{t("fav.disabled")}</p>
  else if (!user)
    body = (
      <>
        <p>{t("fav.signIn")}</p>
        <Button onClick={openAuth}>{t("nav.signIn")}</Button>
      </>
    )
  else if (favoritesLoading && favorites.length === 0) body = <p>{t("fav.loading")}</p>
  else if (favorites.length === 0)
    body = (
      <>
        <p>{t("fav.empty")}</p>
        <Button asChild>
          <Link to="/">{t("fav.find")}</Link>
        </Button>
      </>
    )

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[clamp(28px,4vw,44px)] leading-tight font-bold">{t("fav.title")}</h1>
        <p className="text-sm font-light text-muted-foreground">{t("fav.sub", { max: MAX_FAVORITES })}</p>
      </div>
      {body ? (
        <Card>
          <CardContent className="grid justify-items-start gap-4">{body}</CardContent>
        </Card>
      ) : (
        <ResultList cars={favorites.map((f) => f.car_data)} showRank={false} ordered={false} />
      )}
    </div>
  )
}
