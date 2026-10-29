import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "sonner"

import { Layout } from "@/components/Layout"
import { AccountProvider } from "@/hooks/account"
import Wizard from "@/pages/Wizard"

// The wizard is the landing page; the other pages load on demand.
const Results = lazy(() => import("@/pages/Results"))
const Favorites = lazy(() => import("@/pages/Favorites"))
const Shared = lazy(() => import("@/pages/Shared"))

export default function App() {
  return (
    <BrowserRouter>
      <AccountProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Wizard />} />
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
