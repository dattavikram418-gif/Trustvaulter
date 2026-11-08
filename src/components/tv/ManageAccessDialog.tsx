import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { USERS, userById, type Doc, type Permission } from "@/lib/demo/model";
import { useDemo } from "@/lib/demo/store";

const PERM_LABEL: Record<Permission, string> = { read: "Read", edit: "Edit" };

export function ManageAccessDialog({ doc }: { doc: Doc }) {
  const { grants, setGrant, log } = useDemo();
  const [pick, setPick] = useState("");
  const [perm, setPerm] = useState<Permission>("read");
  const [revoke, setRevoke] = useState<string | null>(null);
  const current = grants[doc.id] ?? {};
  const candidates = USERS.filter((u) => u.id !== doc.ownerId && !current[u.id]);

  const add = () => {
    const u = userById(pick); if (!u) return;
    setGrant(doc.id, u.id, perm);
    log({ action: "grant", doc, outcome: "allowed", detail: `Granted ${PERM_LABEL[perm]} to ${u.email}` });
    toast.success(`${u.email} can now ${perm === "read" ? "read" : "read and edit"} (demo)`);
    setPick("");
  };
  const change = (uid: string, p: Permission) => {
    const u = userById(uid)!; const old = current[uid];
    setGrant(doc.id, uid, p);
    log({ action: "change_permission", doc, outcome: "allowed", detail: `${u.email}: ${PERM_LABEL[old ?? "read"]} → ${PERM_LABEL[p]}` });
    toast.success(`Changed ${u.email} to ${PERM_LABEL[p]} (demo)`);
  };
  const confirmRevoke = () => {
    if (!revoke) return; const u = userById(revoke)!;
    setGrant(doc.id, revoke, null);
    log({ action: "revoke", doc, outcome: "allowed", detail: `Revoked access for ${u.email}` });
    toast.success(`Access revoked for ${u.email} (demo)`, { description: "In production, open sessions and cached links must also be invalidated." });
    setRevoke(null);
  };

  return (
    <>
      <Dialog>
        <DialogTrigger asChild><Button variant="outline"><UserPlus /> Manage access</Button></DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage access</DialogTitle>
            <DialogDescription>{doc.name}. Share with named registered users only. <strong>Read</strong> = view. <strong>Edit</strong> = view and upload new versions. Neither grants sharing or deletion.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="share-user" className="sr-only">Registered user</label>
            <select id="share-user" value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm">
              <option value="">{candidates.length ? "Select registered user…" : "All registered users have access"}</option>
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
            </select>
            <label htmlFor="share-perm" className="sr-only">Permission</label>
            <select id="share-perm" value={perm} onChange={(e) => setPerm(e.target.value as Permission)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
              <option value="read">Read</option><option value="edit">Edit</option>
            </select>
            <Button onClick={add} disabled={!pick}>Grant</Button>
          </div>
          <ul className="divide-y rounded-md border">
            <li className="flex items-center justify-between px-3 py-2 text-sm">
              <span><span className="font-medium">{userById(doc.ownerId)?.name}</span> <span className="text-muted-foreground">{userById(doc.ownerId)?.email}</span></span>
              <span className="text-xs text-muted-foreground">Owner</span>
            </li>
            {Object.entries(current).map(([uid, p]) => {
              const u = userById(uid)!;
              return (
                <li key={uid} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span><span className="font-medium">{u.name}</span> <span className="text-muted-foreground">{u.email}</span></span>
                  <span className="flex items-center gap-2">
                    <select aria-label={`Permission for ${u.email}`} value={p} onChange={(e) => change(uid, e.target.value as Permission)} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
                      <option value="read">Read</option><option value="edit">Edit</option>
                    </select>
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRevoke(uid)}>Revoke</Button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">Changes apply to local demo state only and are not enforced by any server.</p>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>{revoke && userById(revoke)?.email} will lose {revoke && PERM_LABEL[current[revoke] ?? "read"]} access to “{doc.name}”.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Revoke access</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
