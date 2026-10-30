import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { setRates } from "./i18n"
import { getRates, warmUp } from "./lib/api"
import { load, save } from "./lib/storage"
import { applyTheme, onSystemChange } from "./lib/theme"

applyTheme() // shadcn's dark theme is keyed on the .dark class
onSystemChange(applyTheme)

const RELOADED_AT = "carmatch.reloadedAt"
// A tab opened before a deploy asks for chunk files that no longer exist; reload once to get the new ones.
window.addEventListener("vite:preloadError", (e) => {
  if (Date.now() - load(RELOADED_AT, 0) < 10_000) return // just reloaded: don't loop if the chunk is really broken
  save(RELOADED_AT, Date.now())
  e.preventDefault()
  window.location.reload()
})

warmUp()
getRates().then(setRates) // prices show in USD until the day's rates arrive

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
