import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSupabase } from "@/lib/supabase"

type Mode = "signin" | "signup"

export function AuthDialog({ open, onClose }: { open: boolean; onClose: (keepPending: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const supabase = await getSupabase()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } })
    setBusy(false)
    if (error) setError(error.message)
    else if (mode === "signup" && !data.session) setAwaitingConfirm(true)
    // On success with a session, AccountProvider closes the dialog and completes the pending favorite.
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose(awaitingConfirm)
          setAwaitingConfirm(false)
          setError(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{awaitingConfirm ? "Check your inbox" : "Save cars you love"}</DialogTitle>
          <DialogDescription>
            {awaitingConfirm
              ? `We sent a confirmation link to ${email}. Open it to finish signing up, and we'll save the car you picked.`
              : "Sign in or create a free account to keep up to 10 favorites."}
          </DialogDescription>
        </DialogHeader>

        {!awaitingConfirm && (
          <form onSubmit={submit} className="grid gap-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid gap-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "signup" && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
