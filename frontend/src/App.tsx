import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { Toaster } from "sonner"

import { Layout } from "@/components/Layout"
import { AccountProvider } from "@/hooks/account"
import Wizard from "@/pages/Wizard"

// The wizard is the landing page; the other pages load on demand.
const Results = lazy(() => import("@/pages/Results"))
const Favorites = lazy(() => import("@/pages/Favorites"))
const Shared = lazy(() => import("@/pages/Shared"))

// Keyed by navigation so clicking the logo while already on the wizard remounts it with fresh answers.
function WizardPage() {
  return <Wizard key={useLocation().key} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AccountProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<WizardPage />} />
            <Route path="results" element={<Suspense fallback={null}><Results /></Suspense>} />
            <Route path="favorites" element={<Suspense fallback={null}><Favorites /></Suspense>} />
            <Route path="r/:shareId" element={<Suspense fallback={null}><Shared /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <Toaster theme="system" position="bottom-center" richColors closeButton />
      </AccountProvider>
    </BrowserRouter>
  )
}
