import { useQuery } from "@tanstack/react-query";
import { BellRing, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/backend/account";
import { operation, type AccountNotification } from "@/lib/backend/client";

const LABEL: Record<AccountNotification["kind"], string> = {
  own_sign_in: "You signed in",
  account_sign_in: "An account signed in",
  own_session_denied: "A signed-out session of yours was refused",
  account_session_denied: "A signed-out session of an account was refused",
};

export function SignInAlerts() {
  const { identity } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alerts = useQuery({
    queryKey: ["notifications", identity?.id],
    queryFn: () => operation<AccountNotification[]>("notifications", { limit: 50 }),
    enabled: Boolean(identity),
    staleTime: 0,
    retry: false,
  });
  const markAll = async () => {
    setBusy(true);
    setError("");
    try {
      await operation("notifications_read", {});
      await alerts.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unavailable");
    } finally {
      setBusy(false);
    }
  };
  const unread = alerts.data?.filter((n) => !n.read_at).length ?? 0;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">ACCOUNT SAFETY</span>
          <h1 className="mt-2 text-2xl font-semibold">Sign-in alerts</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Successful sign-ins to {identity?.role === "administrator" ? "any account" : "your account"},
            and refused use of a session that had already ended. Repeats within the same hour are
            grouped. Wrong-password attempts happen inside the sign-in service and are not visible
            here.
          </p>
        </div>
        <Button variant="outline" disabled={busy || unread === 0} onClick={() => void markAll()}>
          {busy && <LoaderCircle className="animate-spin" />}
          Mark all as read{unread ? ` (${unread})` : ""}
        </Button>
      </header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {alerts.isLoading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="animate-spin" size={16} /> Loading alerts…
        </p>
      )}
      {alerts.error && (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          Alerts are unavailable right now. {alerts.error.message}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => void alerts.refetch()}>Retry</Button>
        </div>
      )}
      {alerts.data && alerts.data.length === 0 && (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          <BellRing className="mx-auto mb-3" />
          No sign-in alerts yet.
        </div>
      )}
      {alerts.data && alerts.data.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {alerts.data.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start gap-3 p-4 text-sm">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-muted" : "bg-primary"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {LABEL[n.kind]}
                  {n.occurrences > 1 && <span className="text-muted-foreground"> · {n.occurrences} times</span>}
                  {!n.read_at && <span className="sr-only"> (unread)</span>}
                </p>
                {n.kind.startsWith("account_") && (
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Account {n.subject_id}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.occurrences > 1 ? `${new Date(n.first_at).toLocaleString()} – ` : ""}
                  {new Date(n.last_at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        If you don't recognise a sign-in, change your password and sign out everywhere from the
        account menu.
      </p>
    </div>
  );
}
