import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { warmUp } from "./lib/api"
import { applyTheme, onSystemChange } from "./lib/theme"

applyTheme() // shadcn's dark theme is keyed on the .dark class
onSystemChange(applyTheme)

warmUp()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
