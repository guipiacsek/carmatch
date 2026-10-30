import { useId } from "react"

import type { BodyType } from "@/lib/types"

// Side views on a 48x22 grid, all facing right (front on the right); wheels sit on y=16.
// Drawn in currentColor so they follow the chip's text color.
const SHAPES: Record<BodyType, { body: string; wheels: [number, number] }> = {
  SUV: { body: "M3 16V9l1-4h26l5 5 9 1v5z", wheels: [12, 36] },
  Compact: { body: "M8 16V9l2-3h13l6 5 10 1.5V16z", wheels: [14, 33] },
  Sedan: { body: "M3 16V12l6-1 5-5h12l8 5 10 1.5V16z", wheels: [11, 36] },
  Hatchback: { body: "M5 16V8l3-2h14l7 5 8 1.5V16z", wheels: [11, 32] },
  Truck: { body: "M3 16V10h20V5h10l4 5 8 1v5z", wheels: [11, 37] },
  Coupe: { body: "M3 16V13l5-1 10-5h7l7 4.5 12 1.5V16z", wheels: [12, 36] },
  Convertible: { body: "M3 16V12.5l2-.5h21l-1.5-4h1.5l2 4h1l14 1.5V16z", wheels: [12, 36] },
  Minivan: { body: "M3 16V7l2-2.5h24l12 6 3 .5V16z", wheels: [11, 36] },
  Wagon: { body: "M3 16V7.5l1-1.5h24l7 5 9 1.5V16z", wheels: [12, 36] },
}

export function BodyIcon({ type }: { type: BodyType }) {
  const { body, wheels } = SHAPES[type]
  const mask = useId() // the body line is hidden inside the wheels, whatever the chip's background
  return (
    // Inline size: toggle chips force any svg without a size-* class to 16px
    <svg viewBox="0 0 48 22" style={{ width: 44, height: 20 }} className="shrink-0" fill="none" stroke="currentColor" aria-hidden>
      <mask id={mask}>
        <rect width="48" height="22" fill="white" />
        {wheels.map((x) => (
          <circle key={x} cx={x} cy={16} r={3.6} fill="black" />
        ))}
      </mask>
      <path d={body} mask={`url(#${mask})`} strokeWidth={1.2} strokeLinejoin="round" />
      {wheels.map((x) => (
        <circle key={x} cx={x} cy={16} r={3} strokeWidth={1.2} />
      ))}
      <path d="M1 20.2h46" strokeWidth={1} strokeLinecap="round" opacity={0.35} />
    </svg>
  )
}
