import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  FileText,
  LayoutDashboard,
  Share2,
  ScrollText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Search,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  LoaderCircle,
  LockKeyhole,
  BellRing,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAccount } from "@/lib/backend/account";
import { SignIn } from "./SignIn";
import { Brand } from "./WorkspaceVisuals";
import { BACKEND_CONFIGURED } from "@/lib/backend/config";
export function ConnectedShell({ children }: { children: ReactNode }) {
  const { identity, loading, error, logout } = useAccount();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [command, setCommand] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const nav = [
    { to: "/", label: "Overview", icon: LayoutDashboard },
    { to: "/documents", label: "My documents", icon: FileText },
    { to: "/shared", label: "Shared with me", icon: Share2 },
    { to: "/alerts", label: "Sign-in alerts", icon: BellRing },
    ...(identity?.role === "administrator"
      ? [{ to: "/admin", label: "Security activity", icon: ScrollText }]
      : []),
  ] as const;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && identity) {
        e.preventDefault();
        setCommand((o) => !o);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [identity]);
  const signout = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };
  if (!BACKEND_CONFIGURED)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="max-w-lg space-y-3 rounded-lg border p-6 text-sm">
          <Brand />
          <h1 className="text-xl font-semibold">Configuration needed</h1>
          <p className="text-muted-foreground">
            This copy of TrustVault has no backend address. Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (and the matching server variables{" "}
            <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code>) as described in{" "}
            <code>.env.example</code>, then rebuild and restart.
          </p>
        </div>
      </div>
    );
  if (loading)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <Brand />
        <LoaderCircle
          className="animate-spin text-primary"
          aria-label="Checking account"
          role="status"
        />
      </div>
    );
  if (!identity) {
    if (path === "/sign-in-help")
      return (
        <div className="min-h-screen">
          <header className="border-b bg-card px-6 py-5">
            <Link to="/auth" aria-label="TrustVault sign in">
              <Brand />
            </Link>
          </header>
          <main className="px-6">{children}</main>
        </div>
      );
    return <SignIn accountError={error} />;
  }
  const links = (small: boolean) => (
    <nav aria-label="Main" className="space-y-1">
      {nav.map((n) => (
        <Button
          asChild
          variant="ghost"
          key={n.to}
          title={n.label}
          className={`nav-link ${path === n.to ? "nav-active" : ""} ${small ? "justify-center px-0" : "justify-start"}`}
        >
          <Link
            to={n.to}
            aria-current={path === n.to ? "page" : undefined}
            aria-label={n.label}
            onClick={() => setMobile(false)}
          >
            <n.icon />
            {!small && n.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
  const context = path.startsWith("/doc/")
    ? "Document details"
    : (nav.find((n) => n.to === path)?.label ??
      (path === "/sign-in-help" ? "Access guide" : "Workspace"));
  return (
    <div className="workspace-shell">
      <aside className={`desktop-nav ${collapsed ? "nav-collapsed" : ""}`}>
        <div className="px-3 py-6">
          <Brand compact={collapsed} />
        </div>
        <div className="mt-6">{links(collapsed)}</div>
        <Button
          variant="ghost"
          className={`mt-4 w-full text-muted-foreground ${collapsed ? "px-0" : "justify-start"}`}
          title="Navigate workspace"
          aria-label="Navigate workspace"
          onClick={() => setCommand(true)}
        >
          <Search />
          {!collapsed && (
            <>
              <span>Quick navigation</span>
              <kbd className="ml-auto text-[10px]">⌘ K</kbd>
            </>
          )}
        </Button>
        <div className="mt-auto space-y-2 border-t pt-4">
          <Button
            asChild
            variant="ghost"
            className={`w-full ${collapsed ? "px-0" : "justify-start"} text-muted-foreground`}
            title="Access guide"
          >
            <Link to="/sign-in-help" aria-label="Access guide">
              <HelpCircle />
              {!collapsed && "Access guide"}
            </Link>
          </Button>
          <Button
            variant="ghost"
            className={`w-full ${collapsed ? "px-0" : "justify-start"} text-muted-foreground`}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="workspace-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">Workspace</span>
            <ChevronRight size={14} className="hidden text-muted-foreground sm:block" />
            <span className="truncate text-sm font-medium">{context}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              title="Navigate workspace"
              aria-label="Navigate workspace"
              onClick={() => setCommand(true)}
            >
              <Search />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                  <span className="account-avatar">
                    {(identity.display_name || "A").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-32 truncate text-sm sm:block">
                    {identity.display_name || "Your account"}
                  </span>
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="space-y-1">
                  <p>{identity.display_name || "Registered account"}</p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {identity.role.replaceAll("_", " ")}
                  </p>
                  <p className="break-all font-mono text-[10px] font-normal text-muted-foreground">
                    {identity.id}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void navigate({ to: "/sign-in-help" })}>
                  <HelpCircle />
                  Access guide
                </DropdownMenuItem>
                <DropdownMenuItem disabled={signingOut} onSelect={() => void signout()}>
                  <LogOut />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div role="note" className="workspace-disclosure">
          <LockKeyhole size={12} />
          Development preview · Downloads unavailable
        </div>
        {error && (
          <p role="alert" className="px-6 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <main key={path} className="workspace-main">
          {children}
        </main>
      </div>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-72">
          <SheetTitle>
            <Brand />
          </SheetTitle>
          <SheetDescription className="mt-2">Private workspace</SheetDescription>
          <div className="mt-8">{links(false)}</div>
          <Button asChild variant="ghost" className="mt-6 justify-start">
            <Link to="/sign-in-help" onClick={() => setMobile(false)}>
              <HelpCircle />
              Access guide
            </Link>
          </Button>
        </SheetContent>
      </Sheet>
      <Dialog open={command} onOpenChange={setCommand}>
        <DialogContent className="overflow-hidden p-0">
          <DialogTitle className="sr-only">Navigate TrustVault</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate supported workspace pages.
          </DialogDescription>
          <Command>
            <CommandInput placeholder="Go to…" />
            <CommandList>
              <CommandEmpty>No matching destinations.</CommandEmpty>
              <CommandGroup heading="Workspace">
                {nav.map((n) => (
                  <CommandItem
                    key={n.to}
                    onSelect={() => {
                      setCommand(false);
                      void navigate({ to: n.to });
                    }}
                  >
                    <n.icon />
                    {n.label}
                  </CommandItem>
                ))}
                <CommandItem
                  onSelect={() => {
                    setCommand(false);
                    void navigate({ to: "/sign-in-help" });
                  }}
                >
                  <HelpCircle />
                  Access guide
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setCommand(false);
                    void signout();
                  }}
                >
                  <LogOut />
                  Sign out
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
