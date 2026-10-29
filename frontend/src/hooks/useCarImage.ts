import { useEffect, useState } from "react"

import { getImage } from "@/lib/api"
import type { CarImage, CarResult } from "@/lib/types"

/** undefined while loading, null when Commons has no photo. Saved favorites already carry their image. */
export function useCarImage(car: CarResult): CarImage | null | undefined {
  const [image, setImage] = useState<CarImage | null | undefined>(car.image ?? undefined)
  const { car_key, image: saved, year, make, model } = car
  useEffect(() => {
    if (saved) return
    let live = true
    getImage({ year, make, model }).then((img) => live && setImage(img))
    return () => {
      live = false
    }
  }, [car_key, saved, year, make, model])
  return saved ?? image
}
