import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n";
import { getSupabase } from "@/lib/supabase";

type Mode = "signin" | "signup" | "forgot";

export function AuthDialog({
  open,
  recovery = false,
  onClose,
}: {
  open: boolean;
  recovery?: boolean; // signed in from the reset email: ask for a new password
  onClose: (keepPending: boolean) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const supabase = await getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    if (recovery) {
      const { error } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (error) return setError(error.message);
      toast.success(t("auth.updated"));
      return onClose(false);
    }
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      setBusy(false);
      if (error) setError(error.message);
      else setResetSent(true);
      return;
    }
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.href },
          });
    setBusy(false);
    if (error) setError(error.message);
    else if (mode === "signup" && !data.session) setAwaitingConfirm(true);
    // On success with a session, AccountProvider closes the dialog and completes the pending favorite.
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose(awaitingConfirm);
          setAwaitingConfirm(false);
          setResetSent(false);
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {awaitingConfirm || resetSent
              ? t("auth.checkInbox")
              : recovery
                ? t("auth.newTitle")
                : mode === "forgot"
                  ? t("auth.forgotTitle")
                  : t("auth.title")}
          </DialogTitle>
          <DialogDescription>
            {awaitingConfirm
              ? t("auth.sent", { email })
              : resetSent
                ? t("auth.resetSent", { email })
                : recovery
                  ? t("auth.newDesc")
                  : mode === "forgot"
                    ? t("auth.forgotDesc")
                    : t("auth.desc")}
          </DialogDescription>
        </DialogHeader>

        {!awaitingConfirm && !resetSent && (
          <form onSubmit={submit} className="grid gap-4">
            {!recovery && mode !== "forgot" && (
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                  <TabsTrigger value="signup">{t("auth.create")}</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {!recovery && (
              <div className="grid gap-2">
                <Label htmlFor="auth-email">{t("auth.email")}</Label>
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            {mode !== "forgot" || recovery ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auth-password">
                    {recovery ? t("auth.newPassword") : t("auth.password")}
                  </Label>
                  {mode === "signin" && !recovery && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                      }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {t("auth.forgot")}
                    </button>
                  )}
                </div>
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete={
                    mode === "signin" && !recovery
                      ? "current-password"
                      : "new-password"
                  }
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {(mode === "signup" || recovery) && (
                  <p className="text-xs text-muted-foreground">
                    {t("auth.min8")}
                  </p>
                )}
              </div>
            ) : null}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy}>
              {busy
                ? t("auth.wait")
                : recovery
                  ? t("auth.savePassword")
                  : mode === "forgot"
                    ? t("auth.sendLink")
                    : mode === "signin"
                      ? t("auth.signIn")
                      : t("auth.create")}
            </Button>
            {mode === "forgot" && !recovery && (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {t("auth.back")}
              </button>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
