import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/backend/account";
import { Brand, VaultArtwork } from "./WorkspaceVisuals";
export function SignIn({ accountError = "" }: { accountError?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [signup, setSignup] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState("");
  const { refresh } = useAccount();
  return (
    <div className="signin-page">
      <section className="signin-story">
        <Brand />
        <div className="signin-story-copy">
          <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
          <h1>TrustVault</h1>
          <p>
            Documents, thoughtfully organized.
            <br />
            Access, intentionally shared.
          </p>
        </div>
        <VaultArtwork />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck size={16} />
          Development preview · Downloads unavailable
        </div>
      </section>
      <section className="signin-form-side">
        <div className="mb-10 lg:hidden">
          <Brand />
        </div>
        <div className="signin-form">
          <span className="eyebrow">{signup ? "CREATE ACCOUNT" : "WELCOME BACK"}</span>
          <h2 className="mt-3 text-3xl font-semibold">
            {signup ? "Start your private workspace." : "A little more peace of mind."}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {signup
              ? "We'll email you a link to verify your address. After verifying you can add your own documents and share them with people you choose."
              : "Sign in to your private document workspace."}
          </p>
          {sent ? (
            <div role="status" className="mt-8 space-y-4 rounded-lg border p-4 text-sm">
              <p className="font-medium">Check your email</p>
              <p className="text-muted-foreground">
                If {sent} can receive mail, a verification link is on its way. Open it on this device, then sign in.
              </p>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const { error: e2 } = await supabase.auth.resend({ type: "signup", email: sent, options: { emailRedirectTo: window.location.origin } });
                    setError(e2 ? "Could not resend right now. Please wait a minute and try again." : "");
                  } catch {
                    setError("Could not resend right now. Please wait a minute and try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Resend verification email
              </Button>
              <Button variant="ghost" type="button" onClick={() => { setSent(""); setSignup(false); }}>
                Back to sign in
              </Button>
              {error && <p role="alert" className="text-destructive">{error}</p>}
            </div>
          ) : (
          <form
            className="mt-8 space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (signup) {
                  if (password.length < 10) {
                    setError("Use at least 10 characters for your password.");
                    return;
                  }
                  if (password !== confirm) {
                    setError("The two passwords do not match.");
                    return;
                  }
                  const { error: e2 } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
                  setPassword("");
                  setConfirm("");
                  if (e2) setError(signupMessage(e2.message));
                  else setSent(email);
                } else {
                  const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
                  setPassword("");
                  if (e2) setError(/not confirmed/i.test(e2.message) ? "Verify your email first. Use the link we sent you, or create the account again to resend it." : "Unable to sign in. Check your account details.");
                  else await refresh();
                }
              } catch {
                setError(signup ? "Account creation is unavailable. Please try again." : "Sign-in is unavailable. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block text-sm font-medium" htmlFor="signin-email">
              Email address
            </label>
            <input
              id="signin-email"
              required
              type="email"
              autoComplete={signup ? "email" : "username"}
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="workspace-input -mt-3 w-full"
              disabled={busy}
            />
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="signin-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="signin-password"
                  required
                  type={visible ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={signup ? "At least 10 characters" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="workspace-input w-full pr-12"
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-0.5"
                  aria-label={visible ? "Hide password" : "Show password"}
                  aria-pressed={visible}
                  title={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            {signup && (
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="signup-confirm">
                  Confirm password
                </label>
                <input
                  id="signup-confirm"
                  required
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="workspace-input w-full"
                  disabled={busy}
                />
              </div>
            )}
            {(error || accountError) && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error || accountError}
              </p>
            )}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  {signup ? "Creating account…" : "Signing in…"}
                </>
              ) : (
                <>
                  {signup ? "Create account" : "Sign in"}
                  <ArrowRight className="ml-auto" />
                </>
              )}
            </Button>
          </form>
          )}
          {!sent && (
            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              {signup ? "Already have an account?" : "New to TrustVault?"}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => { setSignup(!signup); setError(""); setPassword(""); setConfirm(""); }}
              >
                {signup ? "Sign in" : "Create an account"}
              </button>
              {" · "}
              <Link to="/sign-in-help" className="font-medium text-primary hover:underline">
                How access works
              </Link>
            </p>
          )}
        </div>
        <p className="mt-10 text-center text-xs text-muted-foreground lg:hidden">
          Development preview · Downloads unavailable
        </p>
      </section>
    </div>
  );
}

function signupMessage(raw: string) {
  if (/password/i.test(raw)) return "Choose a stronger password that has not appeared in known data breaches.";
  if (/rate|too many/i.test(raw)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/disabled|not allowed/i.test(raw)) return "Account creation is currently turned off.";
  return "We couldn't create the account. Check the address and try again.";
}
