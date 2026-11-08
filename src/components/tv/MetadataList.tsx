import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  SlidersHorizontal,
  List,
  LayoutGrid,
  X,
  ArrowUpDown,
  Info,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { operation, type DocumentRecord } from "@/lib/backend/client";
import { useAccount } from "@/lib/backend/account";
import { PageHeader } from "./bits";
import { QuarantineUpload } from "./QuarantineUpload";
import { FileIcon, DocumentBadges, LoadSkeleton, ErrorState } from "./WorkspaceVisuals";
const field = "workspace-input w-full";
export function DraftDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          New draft
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Start a document draft</DialogTitle>
        <DialogDescription>
          Save a name and category first. This creates metadata only — no file is stored.
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await operation("create", { name, category });
              setOpen(false);
              setName("");
              setCategory("");
              onCreated();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unavailable");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-medium">
            Document name
            <input
              className={`${field} mt-2`}
              value={name}
              placeholder="Untitled document"
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label className="block text-sm font-medium">
            Category
            <input
              className={`${field} mt-2`}
              value={category}
              placeholder="Optional"
              onChange={(e) => setCategory(e.target.value)}
              maxLength={100}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              {busy && <LoaderCircle className="animate-spin" />}
              {busy ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Inspector({ id }: { id: string }) {
  const { identity } = useAccount();
  const query = useQuery({
    queryKey: ["inspector", identity?.id, id],
    queryFn: () => operation<DocumentRecord>("detail", { id }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const d = query.data;
  return (
    <>
      <SheetTitle>Document information</SheetTitle>
      <SheetDescription>Metadata only · No content preview</SheetDescription>
      {query.isFetching ? (
        <LoadSkeleton />
      ) : query.error || !d ? (
        <ErrorState
          message={query.error?.message ?? "Document unavailable"}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="mt-8">
          <FileIcon name={d.name} large />
          <h2 className="mt-5 break-words text-xl font-semibold">{d.name}</h2>
          <div className="mt-3">
            <DocumentBadges doc={d} />
          </div>
          <dl className="mt-8 space-y-5 text-sm">
            {[
              ["Category", d.category || "Uncategorized"],
              ["Created", new Date(d.created_at).toLocaleString()],
              ["Updated", new Date(d.updated_at).toLocaleString()],
              ["Owner ID", d.owner_id],
              ["Document ID", d.id],
              ["Access revision", String(d.acl_revision)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="mb-1 text-xs text-muted-foreground">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="my-6 border-t pt-5 text-xs leading-5 text-muted-foreground">
            Previews and downloads are unavailable. Files stay in private quarantine.
          </p>
          <Button asChild className="w-full">
            <Link to="/doc/$id" params={{ id: d.id }}>
              Open document details
              <ChevronRight />
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
export function MetadataList({
  scope,
  title,
}: {
  scope: "all" | "owned" | "shared";
  title: string;
}) {
  const { identity } = useAccount();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState("recent");
  const [inspect, setInspect] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setOffset(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [q]);
  const query = useQuery({
    queryKey: ["metadata", identity?.id, scope, search, owner, category, from, to, offset],
    queryFn: () =>
      operation<DocumentRecord[]>("list", {
        scope,
        q: search,
        ...(owner ? { owner } : {}),
        ...(category ? { category } : {}),
        ...(from ? { from: new Date(from).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999Z`).toISOString() } : {}),
        limit: 50,
        offset,
      }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const rows = [...(query.data ?? [])].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const filters = [
    ["Owner", owner, setOwner],
    ["Category", category, setCategory],
    ["From", from, setFrom],
    ["To", to, setTo],
  ] as const;
  const reset = () => {
    setQ("");
    setSearch("");
    setOwner("");
    setCategory("");
    setFrom("");
    setTo("");
    setOffset(0);
  };
  const filtered = !!(q || owner || category || from || to);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={title}
        desc={
          scope === "shared"
            ? "Documents explicitly shared with your account."
            : scope === "owned"
              ? "Your documents, all in one place."
              : "Your accessible documents, at a glance."
        }
        actions={
          identity?.role === "document_creator" ? (
            <div className="flex flex-wrap gap-2">
              <DraftDialog onCreated={() => void query.refetch()} />
              <QuarantineUpload onUploaded={() => void query.refetch()} />
            </div>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b pb-5">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
          <input
            aria-label="Search documents by name"
            placeholder="Search documents…"
            className={`${field} pl-10`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal />
              Filters
              {filters.filter((f) => f[1]).length > 0 && (
                <span className="status-badge bg-accent text-primary">
                  {filters.filter((f) => f[1]).length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            <h2 className="text-sm font-semibold">Filter documents</h2>
            {filters.map(([label, value, set]) => (
              <label key={label} className="block text-xs font-medium">
                {label === "Owner"
                  ? "Owner account ID"
                  : label === "From"
                    ? "Created from"
                    : label === "To"
                      ? "Created to"
                      : label}
                <input
                  type={label === "From" || label === "To" ? "date" : "text"}
                  className={`${field} mt-2`}
                  value={value}
                  onChange={(e) => {
                    set(e.target.value);
                    setOffset(0);
                  }}
                />
              </label>
            ))}
            <Button variant="ghost" onClick={reset}>
              <X />
              Clear filters
            </Button>
          </PopoverContent>
        </Popover>
        <div
          className="flex rounded-lg border bg-card p-0.5"
          role="group"
          aria-label="Document display"
        >
          <Button
            size="icon"
            variant={view === "list" ? "secondary" : "ghost"}
            aria-label="List view"
            title="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List />
          </Button>
          <Button
            size="icon"
            variant={view === "grid" ? "secondary" : "ghost"}
            aria-label="Grid view"
            title="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid />
          </Button>
        </div>
      </div>
      {filtered && (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          {filters
            .filter((f) => f[1])
            .map(([label, value, set]) => (
              <Button
                key={label}
                variant="secondary"
                size="sm"
                className="max-w-full"
                onClick={() => {
                  set("");
                  setOffset(0);
                }}
                title={`Remove ${label} filter`}
              >
                <span className="truncate">
                  {label}: {value}
                </span>
                <X size={12} />
              </Button>
            ))}
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset all
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 py-4">
        <p className="text-xs text-muted-foreground">
          {query.isFetching ? "Checking current access…" : `${rows.length} documents on this page`}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowUpDown size={13} />
          <span>Sort this page</span>
          <select
            className="h-11 rounded-md bg-transparent px-2 text-xs text-foreground"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Newest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      {query.isFetching ? (
        <LoadSkeleton />
      ) : query.error ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <div className="border-y py-20 text-center">
          <FolderOpen className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-5 text-lg font-semibold">
            {filtered
              ? "No matching documents"
              : scope === "shared"
                ? "Nothing shared with you yet"
                : "A fresh start for your documents"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {filtered
              ? "Try another name or clear your filters."
              : scope === "shared"
                ? "Documents will appear here when an owner grants you access."
                : "Accessible drafts and quarantined documents will appear here."}
          </p>
          {filtered && (
            <Button className="mt-5" variant="outline" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="document-grid">
          {rows.map((d) => (
            <article key={d.id} className="document-card">
              <div className="flex items-start justify-between">
                <FileIcon name={d.name} large />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Inspect ${d.name}`}
                  title="Document information"
                  onClick={() => setInspect(d.id)}
                >
                  <Info />
                </Button>
              </div>
              <Link
                to="/doc/$id"
                params={{ id: d.id }}
                className="mt-5 block break-words font-semibold hover:text-primary"
              >
                {d.name}
              </Link>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">
                {d.category || "Uncategorized"} · {new Date(d.created_at).toLocaleDateString()}
              </p>
              <DocumentBadges doc={d} />
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b text-xs font-normal text-muted-foreground">
              <tr>
                <th className="pb-3 pl-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Category</th>
                <th className="pb-3 font-medium">Access & status</th>
                <th className="pb-3 font-medium">Created</th>
                <th className="w-14">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="document-row border-b">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <FileIcon name={d.name} />
                      <Link
                        className="max-w-72 break-words font-medium hover:text-primary"
                        to="/doc/$id"
                        params={{ id: d.id }}
                      >
                        {d.name}
                      </Link>
                    </div>
                  </td>
                  <td className="pr-4 text-xs text-muted-foreground">
                    {d.category || "Uncategorized"}
                  </td>
                  <td className="pr-4">
                    <DocumentBadges doc={d} />
                  </td>
                  <td className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <Button
                      className="row-action"
                      variant="ghost"
                      size="icon"
                      aria-label={`Inspect ${d.name}`}
                      title="Document information"
                      onClick={() => setInspect(d.id)}
                    >
                      <Info />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <p className="text-xs text-muted-foreground">Page {offset / 50 + 1} · Up to 50 documents</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            title="Previous page"
            aria-label="Previous page"
            disabled={offset === 0 || query.isFetching}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Next page"
            aria-label="Next page"
            disabled={(query.data?.length ?? 0) < 50 || offset >= 10000 || query.isFetching}
            onClick={() => setOffset(offset + 50)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <Sheet
        open={!!inspect}
        onOpenChange={(v) => {
          if (!v) setInspect(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {inspect && <Inspector id={inspect} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
