import type { BodyType } from "@/lib/types"

// Side views on a 48x22 grid; wheels sit on y=16. Drawn in currentColor so they follow the chip's text color.
const SHAPES: Record<BodyType, { body: string; wheels: [number, number] }> = {
  Sedan: { body: "M3 16V13l8-1.5 6-5h13l7 5 8 1.5V16z", wheels: [12, 36] },
  Hatchback: { body: "M4 16v-3.5l7-1.5 6-5h13l7 4.5.5 5.5z", wheels: [12, 33] },
  Coupe: { body: "M3 16v-3l9-1.5 7-4h9l9 4.5 8 1V16z", wheels: [12, 36] },
  Convertible: { body: "M3 16v-3.5l15-1 3.5-3 1.5 3 22 1V16z", wheels: [12, 36] },
  SUV: { body: "M3 16v-6l5-.5 4-5h26l4 5 3 .5v6z", wheels: [12, 36] },
  Compact: { body: "M8 16v-3.5l5-1 5-5h11l6 5 5 1V16z", wheels: [15, 33] },
  Truck: { body: "M3 16v-6l6-.5 4-5h11v5.5h21V16z", wheels: [11, 37] },
  Minivan: { body: "M3 16V7l2.5-2.5H33l11 5.5.5 6z", wheels: [11, 36] },
  Wagon: { body: "M3 16v-3.5l6-1 6-5h27l2 4.5 1 5z", wheels: [12, 36] },
}

export function BodyIcon({ type }: { type: BodyType }) {
  const { body, wheels } = SHAPES[type]
  return (
    // Inline size: toggle chips force any svg without a size-* class to 16px
    <svg viewBox="0 0 48 22" style={{ width: 44, height: 20 }} className="shrink-0" aria-hidden>
      <path d={body} fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      {wheels.map((x) => (
        <circle key={x} cx={x} cy={16} r={3.2} fill="currentColor" />
      ))}
    </svg>
  )
}
