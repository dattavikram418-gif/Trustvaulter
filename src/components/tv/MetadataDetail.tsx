import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Download,
  FileText,
  Trash2,
  ChevronLeft,
  Shield,
  Clock,
  LoaderCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  operation,
  type DocumentRecord,
  type EventRecord,
  type GrantRecord,
} from "@/lib/backend/client";
import { useAccount } from "@/lib/backend/account";
import { QuarantineUpload, quarantineOperation, type QuarantineVersion } from "./QuarantineUpload";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileIcon, DocumentBadges, LoadSkeleton, ErrorState } from "./WorkspaceVisuals";

export function Events({
  events,
  ownerDetails = false,
}: {
  events: EventRecord[];
  ownerDetails?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="p-3">Time</th>
            <th className="p-3">Actor ID</th>
            <th className="p-3">Document ID</th>
            <th className="p-3">Action</th>
            <th className="p-3">Outcome</th>
            <th className="p-3">Request ID</th>
            {ownerDetails && <th className="p-3">Permission history</th>}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.sequence} className="border-b">
              <td className="whitespace-nowrap p-3">{new Date(e.at).toLocaleString()}</td>
              <td className="max-w-44 break-all p-3 font-mono">{e.actor_id || "Unverified"}</td>
              <td className="max-w-44 break-all p-3 font-mono">{e.document_id || "—"}</td>
              <td className="p-3">{e.action}</td>
              <td className="p-3">{e.outcome}</td>
              <td className="max-w-44 break-all p-3 font-mono">
                {e.request_id || "Legacy — unavailable"}
              </td>
              {ownerDetails && (
                <td className="min-w-48 p-3">
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3">Event details</summary>
                    <dl className="mt-2 space-y-1">
                      <dt className="text-muted-foreground">Verified session ID</dt>
                      <dd className="break-all font-mono">
                        {e.session_id || "Unavailable / unverified"}
                      </dd>
                      {e.changes?.target_user_id && (
                        <>
                          <dt className="text-muted-foreground">Recipient ID</dt>
                          <dd className="break-all font-mono">{e.changes.target_user_id}</dd>
                          <dt className="text-muted-foreground">Permission</dt>
                          <dd>
                            {e.changes.old_permission || "None"} →{" "}
                            {e.changes.new_permission || "None"}
                          </dd>
                          <dt className="text-muted-foreground">Revision</dt>
                          <dd>
                            {e.changes.prior_acl_revision} → {e.changes.new_acl_revision}
                          </dd>
                        </>
                      )}
                    </dl>
                  </details>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!events.length && <p className="p-6 text-muted-foreground">No events.</p>}
    </div>
  );
}
function ManageAccess({ doc, refresh }: { doc: DocumentRecord; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [permission, setPermission] = useState("read");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const grants = useQuery({
    queryKey: ["grants", doc.id, doc.acl_revision],
    queryFn: () => operation<GrantRecord[]>("grants", { id: doc.id }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setConfirm(null);
      refresh();
      void grants.refetch();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unavailable");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const apply = (action: "grant" | "revoke", uid: string, next = permission) =>
    run(() =>
      operation(action, {
        id: doc.id,
        revision: doc.acl_revision,
        user_id: uid,
        ...(action === "grant" ? { permission: next } : {}),
      }),
    );
  const share = async () => {
    const ok = await run(() =>
      operation("share_email", { id: doc.id, revision: doc.acl_revision, email: target, permission }),
    );
    if (ok) setTarget("");
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users />
          Manage access
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Manage access</DialogTitle>
        <DialogDescription>
          Share with one person by the email address they verified when signing up. Read permits
          viewing details; Edit also permits changes and new versions, never sharing or deletion.
          You can check up to 20 addresses an hour.
        </DialogDescription>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void share();
          }}
        >
          <label className="block text-sm">
            Recipient email address
            <input
              required
              type="email"
              autoComplete="off"
              placeholder="colleague@company.com"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="workspace-input mt-2 w-full"
            />
          </label>
          <label className="block text-sm">
            Permission
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              className="workspace-input ml-3"
            >
              <option value="read">Read</option>
              <option value="edit">Edit</option>
            </select>
          </label>
          <Button disabled={busy} type="submit">
            {busy && <LoaderCircle className="animate-spin" />}
            {busy ? "Saving…" : "Save access"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {grants.error && <p role="alert">{grants.error.message}</p>}
        <ul className="divide-y">
          {grants.data?.map((g) => (
            <li key={g.user_id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="min-w-0 flex-1 break-all text-sm">
                {g.shared_email ?? <span className="font-mono text-xs">{g.user_id}</span>}
              </span>
              <label className="sr-only" htmlFor={`perm-${g.user_id}`}>
                Permission for {g.shared_email ?? g.user_id}
              </label>
              <select
                id={`perm-${g.user_id}`}
                value={g.permission}
                disabled={busy}
                onChange={(e) => void apply("grant", g.user_id, e.target.value)}
                className="workspace-input h-8 text-xs"
              >
                <option value="read">Read</option>
                <option value="edit">Edit</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm(g.user_id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
        {confirm && (
          <div className="space-y-2 border-t pt-3">
            <p className="break-all text-sm">
              Revoke access for{" "}
              {grants.data?.find((g) => g.user_id === confirm)?.shared_email ?? confirm}?
            </p>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void apply("revoke", confirm)}
            >
              Confirm revoke
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function MetadataDetail({ id }: { id: string }) {
  const { identity } = useAccount();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const query = useQuery({
    queryKey: ["detail", identity?.id, id],
    queryFn: () => operation<DocumentRecord>("detail", { id }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const doc = query.data;
  const owner = doc?.access === "owner";
  const versions = useQuery({
    queryKey: ["versions", id, doc?.acl_revision],
    queryFn: () => quarantineOperation<QuarantineVersion[]>("versions", { id }),
    enabled: !!doc,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const activity = useQuery({
    queryKey: ["activity", id, doc?.acl_revision],
    queryFn: () => operation<EventRecord[]>("activity", { id }),
    enabled: owner === true,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const refresh = () => {
    void query.refetch();
    void activity.refetch();
    void cache.invalidateQueries({ queryKey: ["metadata"] });
  };
  const mutate = async (action: string, payload: Record<string, unknown>) => {
    if (!doc) return;
    setBusy(true);
    setError("");
    try {
      await operation(action, { id, revision: doc.acl_revision, ...payload });
      if (action === "delete") {
        cache.clear();
        await navigate({ to: "/documents", replace: true });
      } else refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unavailable");
      refresh();
    } finally {
      setBusy(false);
    }
  };
  if (query.isFetching) return <LoadSkeleton />;
  if (query.error || !doc)
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-2xl font-semibold">Document unavailable</h1>
        <p className="mt-2 text-muted-foreground">{query.error?.message || "Not found"}</p>
        <Link to="/" className="text-primary">
          Back to overview
        </Link>
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl">
      <Button asChild variant="ghost" className="-ml-3 mb-4 text-muted-foreground">
        <Link to="/documents">
          <ChevronLeft />
          Documents
        </Link>
      </Button>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <FileIcon name={doc.name} large />
          <div className="min-w-0">
            <h1 className="break-words text-3xl font-semibold">{doc.name}</h1>
            <p className="mb-3 mt-2 text-sm text-muted-foreground">
              {doc.category || "Uncategorized"} · Updated{" "}
              {new Date(doc.updated_at).toLocaleDateString()}
            </p>
            <DocumentBadges doc={doc} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled
            variant="outline"
            title="Delivery remains blocked pending scanner and revocation safeguards"
          >
            <Download />
            Download unavailable
          </Button>
          {owner && <ManageAccess doc={doc} refresh={refresh} />}{" "}
          {owner && (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => setDeleteConfirm(true)}
              title="Delete document"
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={deleteConfirm}
        onOpenChange={(v) => {
          if (!busy) setDeleteConfirm(v);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete this document?</DialogTitle>
          <DialogDescription>
            This tombstones the document metadata. It cannot be undone here; successful quarantined
            versions are not purged.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setDeleteConfirm(false)}>
              Keep document
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void mutate("delete", {})}>
              {busy && <LoaderCircle className="animate-spin" />}Confirm deletion
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Tabs defaultValue="details">
        <TabsList className="detail-tabs">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          {owner && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="pt-7">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <section>
              <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/50 px-6 text-center">
                <Shield className="size-10 text-primary" />
                <h2 className="mt-4 text-lg font-semibold">
                  {doc.lifecycle === "quarantined"
                    ? "Files remain in quarantine"
                    : "Metadata draft"}
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  {doc.lifecycle === "quarantined"
                    ? "This is a metadata-only view. Previews and downloads stay disabled until scanning and delivery safeguards are verified."
                    : "No file has been stored. Add a version to place a file in private quarantine."}
                </p>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-5 text-sm">
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Created</dt>
                  <dd>{new Date(doc.created_at).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Access revision</dt>
                  <dd>{doc.acl_revision}</dd>
                </div>
              </dl>
              <details className="mt-6 border-t py-4 text-xs">
                <summary className="flex min-h-11 cursor-pointer items-center font-medium text-muted-foreground">
                  Document identifiers
                </summary>
                <dl className="mt-3 space-y-3">
                  <div>
                    <dt className="text-muted-foreground">Owner ID</dt>
                    <dd className="break-all font-mono">{doc.owner_id}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Document ID</dt>
                    <dd className="break-all font-mono">{doc.id}</dd>
                  </div>
                </dl>
              </details>
            </section>
            <section>
              <h2 className="text-lg font-semibold">Document information</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Categories organize documents. They do not grant access.
              </p>
              {owner || doc.access === "edit" ? (
                <form
                  key={doc.acl_revision}
                  className="mt-6 space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget);
                    void mutate("edit", {
                      name: fields.get("name"),
                      category: fields.get("category"),
                    });
                  }}
                >
                  <label className="block text-sm font-medium">
                    Name
                    <input
                      name="name"
                      defaultValue={doc.name}
                      required
                      maxLength={200}
                      className="workspace-input mt-2 w-full"
                      disabled={busy}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Category
                    <input
                      name="category"
                      defaultValue={doc.category}
                      maxLength={100}
                      className="workspace-input mt-2 w-full"
                      disabled={busy}
                    />
                  </label>
                  <Button disabled={busy} type="submit">
                    {busy && <LoaderCircle className="animate-spin" />}
                    {busy ? "Saving…" : "Save changes"}
                  </Button>
                </form>
              ) : (
                <dl className="mt-6 space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="mt-1 break-words">{doc.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Category</dt>
                    <dd className="mt-1">{doc.category || "Uncategorized"}</dd>
                  </div>
                </dl>
              )}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="versions" className="pt-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Quarantined versions</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Stored files are not available for preview or download.
              </p>
            </div>
            {(owner || doc.access === "edit") && (
              <QuarantineUpload
                doc={doc}
                onUploaded={() => {
                  refresh();
                  void versions.refetch();
                }}
              />
            )}
          </div>
          {versions.isFetching ? (
            <LoadSkeleton />
          ) : versions.error ? (
            <ErrorState message={versions.error.message} onRetry={() => void versions.refetch()} />
          ) : (
            <div>
              {versions.data?.map((v) => (
                <article key={v.id} className="flex items-start gap-4 border-b py-5">
                  <FileIcon name={v.filename} />
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-semibold">
                      {v.filename}{" "}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Version {v.version_number}
                      </span>
                    </h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {(v.byte_size / 1024).toFixed(1)} KB · Quarantined · Scan evidence:{" "}
                      {v.scan_evidence}
                    </p>
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="min-h-11 cursor-pointer py-3">File digest</summary>
                      <p className="break-all font-mono">SHA-256 {v.digest}</p>
                    </details>
                  </div>
                </article>
              ))}
              {!versions.data?.length && (
                <div className="border-y py-16 text-center">
                  <FileText className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-4 font-medium">No file versions yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This document currently contains metadata only.
                  </p>
                </div>
              )}
            </div>
          )}
        </TabsContent>
        {owner && (
          <TabsContent value="activity" className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Document activity</h2>
            </div>
            {activity.isFetching ? (
              <LoadSkeleton />
            ) : activity.error ? (
              <ErrorState
                message={activity.error.message}
                onRetry={() => void activity.refetch()}
              />
            ) : (
              <Events events={activity.data ?? []} ownerDetails />
            )}
            <p className="mt-5 text-xs text-muted-foreground">
              Durable hash-chained events · No independent integrity anchor · DBA/runtime trust
              remains.
            </p>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
