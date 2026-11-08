import { Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import type { Permission } from "@/lib/demo/model";

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  teal: "bg-accent text-accent-foreground",
  ok: "bg-success text-success-foreground",
  warn: "bg-warning text-warning-foreground",
  danger: "bg-destructive/10 text-destructive",
  sim: "bg-sim text-sim-foreground",
};

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${TONES[tone]}`}>{children}</span>;
}

export function ClassBadge({ c }: { c: string }) {
  return <Pill tone={c === "Restricted" ? "danger" : c === "Confidential" ? "warn" : "neutral"}>{c}</Pill>;
}

export function AccessBadge({ access }: { access: "owner" | Permission | "metadata" }) {
  const map = { owner: ["teal", "Owner"], edit: ["ok", "Edit"], read: ["neutral", "Read"], metadata: ["sim", "Metadata only"] } as const;
  const [tone, label] = map[access];
  return <Pill tone={tone}>{label}</Pill>;
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function AccessDenied({ reason }: { reason?: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <ShieldX className="mx-auto size-10 text-destructive" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {reason ?? "This item doesn't exist or you don't have access to it."}
      </p>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Back to overview</Link>
    </div>
  );
}
