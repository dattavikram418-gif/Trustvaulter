import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { FileText, FolderLock, LayoutDashboard, Menu, ScrollText, Share2, ShieldCheck, FlaskConical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { USERS } from "@/lib/demo/model";
import { useDemo } from "@/lib/demo/store";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/documents", label: "My documents", icon: FileText },
  { to: "/shared", label: "Shared with me", icon: Share2 },
  { to: "/admin", label: "Admin console", icon: ScrollText, admin: true },
] as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useDemo();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <FolderLock className="size-5 text-sidebar-primary" aria-hidden />
        <span className="text-base font-semibold tracking-tight">TrustVault</span>
        <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 font-mono text-[10px] uppercase text-sidebar-muted">Prototype</span>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
        {NAV.filter((n) => !("admin" in n) || user.role === "admin").map((n) => {
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"}`}
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <PersonaSelector />
    </div>
  );
}

function PersonaSelector() {
  const { user, setPersona } = useDemo();
  const navigate = useNavigate();
  return (
    <div className="m-3 rounded-lg border border-sidebar-border p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-primary">
        <FlaskConical className="size-3.5" aria-hidden /> Demo mode — simulation
      </div>
      <label htmlFor="persona" className="text-xs text-sidebar-muted">View interface as persona</label>
      <select
        id="persona"
        value={user.id}
        onChange={(e) => {
          setPersona(e.target.value);
          navigate({ to: "/" });
          toast.info("Persona switched — demo data reset", { description: "This is a UI simulation, not sign-in. No security is enforced." });
        }}
        className="mt-1 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1.5 text-sm text-sidebar-foreground"
      >
        {USERS.map((u) => (
          <option key={u.id} value={u.id}>{u.email}</option>
        ))}
      </select>
      <p className="mt-2 text-[11px] leading-snug text-sidebar-muted">
        Not authentication. Switching resets local demo state; so does refreshing.
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user } = useDemo();
  return (
    <div className="flex min-h-screen w-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 md:block"><SidebarBody /></aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <div role="note" className="flex items-center gap-2 border-b bg-sim px-4 py-1.5 text-xs text-sim-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          <span>Interactive prototype with synthetic data. Role checks here are UI-only and do not enforce security.</span>
        </div>
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:px-8">
          <button className="md:hidden rounded-md p-1.5 hover:bg-muted" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <span className="font-semibold md:hidden">TrustVault</span>
          <div className="ml-auto text-right text-sm">
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email} · {user.role === "admin" ? "Admin" : "Member"} (simulated)</div>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
