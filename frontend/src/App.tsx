import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "sonner"

import { Layout } from "@/components/Layout"
import { AccountProvider } from "@/hooks/account"
import Favorites from "@/pages/Favorites"
import Results from "@/pages/Results"
import Wizard from "@/pages/Wizard"

export default function App() {
  return (
    <BrowserRouter>
      <AccountProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Wizard />} />
            <Route path="results" element={<Results />} />
            <Route path="favorites" element={<Favorites />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <Toaster theme="system" position="bottom-center" richColors closeButton />
      </AccountProvider>
    </BrowserRouter>
  )
}
