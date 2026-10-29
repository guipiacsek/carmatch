import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

interface Option<T extends string> {
  value: T
  label: string
  hint?: string
}

const itemClass =
  "h-auto min-h-11 justify-start rounded-xl border px-4 py-2.5 text-left whitespace-normal data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"

function Items<T extends string>({ options }: { options: Option<T>[] }) {
  return options.map((o) => (
    <ToggleGroupItem key={o.value} value={o.value} variant="outline" className={itemClass}>
      <span className="flex flex-col">
        <span className="font-medium">{o.label}</span>
        {o.hint && <span className="text-xs opacity-75">{o.hint}</span>}
      </span>
    </ToggleGroupItem>
  ))
}

const groupClass = "grid w-full grid-cols-2 gap-2 sm:grid-cols-3"

export function MultiChoice<T extends string>(props: {
  label: string
  options: Option<T>[]
  value: T[]
  onChange: (v: T[]) => void
  className?: string
}) {
  return (
    <ToggleGroup
      type="multiple"
      aria-label={props.label}
      value={props.value}
      onValueChange={(v) => props.onChange(v as T[])}
      className={cn(groupClass, props.className)}
    >
      <Items options={props.options} />
    </ToggleGroup>
  )
}

export function SingleChoice<T extends string>(props: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={props.label}
      value={props.value}
      onValueChange={(v) => v && props.onChange(v as T)} // ignore deselect: one option stays chosen
      className={groupClass}
    >
      <Items options={props.options} />
    </ToggleGroup>
  )
}
