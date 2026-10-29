import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { setRates } from "./i18n"
import { getRates, warmUp } from "./lib/api"
import { applyTheme, onSystemChange } from "./lib/theme"

applyTheme() // shadcn's dark theme is keyed on the .dark class
onSystemChange(applyTheme)

warmUp()
getRates().then(setRates) // prices show in USD until the day's rates arrive

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
