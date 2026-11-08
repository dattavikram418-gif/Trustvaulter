import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ScrollText, ChevronLeft, ChevronRight, ArrowRight, RotateCcw } from "lucide-react";
import { operation, type AdminEventPage, type AdminEvent } from "@/lib/backend/client";
import { PageHeader } from "./bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadSkeleton, ErrorState } from "./WorkspaceVisuals";

const PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Filters = { actor_id: string; document_id: string; recipient_id: string; outcome: string; from: string; to: string };
const EMPTY: Filters = { actor_id: "", document_id: "", recipient_id: "", outcome: "", from: "", to: "" };

function buildPayload(group: string, f: Filters, before?: string) {
  const p: Record<string, unknown> = { group, limit: PAGE };
  for (const k of ["actor_id", "document_id", "outcome"] as const) if (f[k]) p[k] = f[k];
  if (group === "permission_changes" && f.recipient_id) p['recipient_id'] = f.recipient_id;
  if (f.from) p['from'] = new Date(`${f.from}T00:00:00`).toISOString();
  if (f.to) p['to'] = new Date(`${f.to}T23:59:59.999`).toISOString();
  if (before) p['before'] = before;
  return p;
}
const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "—");

function Change({ e }: { e: AdminEvent }) {
  if (e.permission_detail === "not_applicable") return <span className="text-muted-foreground">—</span>;
  if (e.permission_detail === "unavailable")
    return <span className="text-xs text-muted-foreground">Details not recorded</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="font-mono text-xs" title={e.recipient_id ?? ""}>{short(e.recipient_id)}</span>
      <span className="rounded border px-1.5 text-xs">{e.old_permission ?? "none"}</span>
      <ArrowRight className="size-3 text-muted-foreground" aria-label="to" />
      <span className="rounded border px-1.5 text-xs">{e.new_permission ?? "none"}</span>
      <span className="text-xs text-muted-foreground">rev {e.prior_acl_revision}→{e.new_acl_revision}</span>
    </span>
  );
}

export function SecurityActivity() {
  const [group, setGroup] = useState<"all" | "permission_changes">("permission_changes");
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [cursors, setCursors] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const before = cursors.at(-1);
  const query = useQuery({
    queryKey: ["admin_events", group, applied, before],
    queryFn: () => operation<AdminEventPage>("admin_events", buildPayload(group, applied, before)),
    staleTime: 0, gcTime: 0, retry: false,
  });
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    for (const k of ["actor_id", "document_id", "recipient_id"] as const)
      if (draft[k] && !UUID.test(draft[k].trim())) return setFormError("Identifiers must be full UUIDs.");
    if (draft.from && draft.to && draft.from > draft.to) return setFormError("Start date is after end date.");
    setFormError(""); setCursors([]);
    setApplied({ ...draft, actor_id: draft.actor_id.trim().toLowerCase(), document_id: draft.document_id.trim().toLowerCase(), recipient_id: draft.recipient_id.trim().toLowerCase() });
  };
  const reset = () => { setDraft(EMPTY); setApplied(EMPTY); setCursors([]); setFormError(""); };
  const events = query.data?.events ?? [];
  const active = Object.values(applied).some(Boolean);
  const field = (k: keyof Filters, label: string, type = "text") => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${k}`} className="text-xs">{label}</Label>
      <Input id={`f-${k}`} type={type} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
        className="h-11 font-mono text-xs" placeholder={type === "text" ? "Full UUID" : undefined} />
    </div>
  );
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Security activity"
        desc="Security metadata only. This view grants no access to document titles, content or sharing." />
      <Tabs value={group} onValueChange={(v) => { setGroup(v as typeof group); setCursors([]); }}>
        <TabsList className="detail-tabs">
          <TabsTrigger value="permission_changes">Permission changes</TabsTrigger>
          <TabsTrigger value="all">All activity</TabsTrigger>
        </TabsList>
      </Tabs>
      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Server-side filters">
        {field("actor_id", "Actor")}
        {field("document_id", "Document")}
        {group === "permission_changes" && field("recipient_id", "Recipient")}
        <div className="grid gap-1.5">
          <Label htmlFor="f-outcome" className="text-xs">Outcome</Label>
          <select id="f-outcome" value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
            className="h-11 rounded-md border bg-background px-3 text-sm">
            <option value="">Any</option><option value="allowed">Allowed</option><option value="denied">Denied</option>
          </select>
        </div>
        {field("from", "From", "date")}
        {field("to", "To", "date")}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
          <Button type="submit" className="h-11">Apply filters</Button>
          <Button type="button" variant="outline" className="h-11" onClick={reset} disabled={!active && !Object.values(draft).some(Boolean)}>
            <RotateCcw /> Reset
          </Button>
        </div>
        {formError && <p role="alert" className="text-sm text-destructive sm:col-span-full">{formError}</p>}
      </form>
      <p className="py-4 text-xs text-muted-foreground">
        Filters run on the server across the full audit log, newest first. Recipient and before→after values
        appear only where the server recorded them; older or denied events show "Details not recorded".
      </p>
      {query.isFetching ? <LoadSkeleton /> : query.error ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : events.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-3">Seq</th><th className="p-3">Time</th><th className="p-3">Action</th><th className="p-3">Outcome</th>
                <th className="p-3">Actor</th><th className="p-3">Document</th><th className="p-3">Recipient · change</th><th className="p-3">Request</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.sequence} className="border-t align-top">
                  <td className="p-3 font-mono text-xs">{e.sequence}</td>
                  <td className="p-3 whitespace-nowrap text-xs">{new Date(e.at).toLocaleString()}</td>
                  <td className="p-3">{e.action}</td>
                  <td className="p-3"><span className={e.outcome === "denied" ? "text-destructive" : ""}>{e.outcome}</span></td>
                  <td className="p-3 font-mono text-xs" title={e.actor_id ?? ""}>{short(e.actor_id)}</td>
                  <td className="p-3 font-mono text-xs" title={e.document_id ?? ""}>{short(e.document_id)}</td>
                  <td className="p-3"><Change e={e} /></td>
                  <td className="p-3 font-mono text-xs" title={e.request_id ?? ""}>{short(e.request_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-y py-16 text-center">
          <ScrollText className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 font-medium">No matching {group === "permission_changes" ? "permission changes" : "events"}</p>
          {active && <Button variant="link" onClick={reset}>Reset filters</Button>}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <p className="text-xs text-muted-foreground">Page {cursors.length + 1}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="size-11" aria-label="Newer page" disabled={!cursors.length || query.isFetching}
            onClick={() => setCursors(cursors.slice(0, -1))}><ChevronLeft /></Button>
          <Button variant="outline" size="icon" className="size-11" aria-label="Older page" disabled={!query.data?.next_before || query.isFetching}
            onClick={() => query.data?.next_before && setCursors([...cursors, query.data.next_before])}><ChevronRight /></Button>
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Each view of this page is itself recorded. Append-only at the application boundary; the hash chain is
        unanchored, not tamper-proof or independently verified. No export or download.
      </p>
    </div>
  );
}
