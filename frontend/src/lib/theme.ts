// Light/dark theme: the visitor's saved choice, else the OS setting. index.html applies it before first paint
// (same key and rule) so dark-mode visitors don't see a white flash.
const KEY = "carmatch.theme"
const systemDark = window.matchMedia("(prefers-color-scheme: dark)")

function saved(): "light" | "dark" | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "dark" ? v : null
  } catch {
    return null
  }
}

export const isDark = () => (saved() ?? (systemDark.matches ? "dark" : "light")) === "dark"

export const applyTheme = () => document.documentElement.classList.toggle("dark", isDark())

export function setDark(dark: boolean): void {
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light")
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  document.documentElement.classList.toggle("dark", dark)
}

/** Follow OS theme changes while the visitor hasn't picked one. */
export const followSystem = () => systemDark.addEventListener("change", applyTheme)
