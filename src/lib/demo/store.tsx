import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  USERS, initialAudit, initialDocs, initialGrants, userById,
  type AuditAction, type AuditEvent, type Doc, type Grants, type Permission, type User,
} from "./model";

interface DemoState {
  user: User;
  docs: Doc[];
  grants: Grants;
  audit: AuditEvent[];
  setPersona: (id: string) => void;
  resetDemo: () => void;
  log: (e: { action: AuditAction; doc: Doc | { id: string; name: string }; outcome: "allowed" | "denied"; detail: string }) => void;
  addDoc: (d: Doc) => void;
  deleteDoc: (id: string) => void;
  addVersion: (id: string, note: string) => void;
  setGrant: (docId: string, userId: string, perm: Permission | null) => void;
}

const Ctx = createContext<DemoState | null>(null);
let seq = 100;

export function DemoProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("u-owner");
  const [docs, setDocs] = useState(initialDocs);
  const [grants, setGrants] = useState<Grants>(initialGrants);
  const [audit, setAudit] = useState(initialAudit);
  const user = userById(userId) ?? USERS[1]!;

  const resetDemo = useCallback(() => {
    setDocs(initialDocs()); setGrants(initialGrants()); setAudit(initialAudit());
  }, []);

  const setPersona = useCallback((id: string) => { setUserId(id); resetDemo(); }, [resetDemo]);

  const log: DemoState["log"] = useCallback(({ action, doc, outcome, detail }) => {
    setAudit((a) => [
      { id: `e-${++seq}`, at: new Date().toISOString(), actorId: userId, action, docId: doc.id, docName: doc.name, outcome, detail },
      ...a,
    ]);
  }, [userId]);

  const value = useMemo<DemoState>(() => ({
    user, docs, grants, audit, setPersona, resetDemo, log,
    addDoc: (d) => setDocs((ds) => [d, ...ds]),
    deleteDoc: (id) => {
      setDocs((ds) => ds.filter((d) => d.id !== id));
      setGrants((g) => { const n = { ...g }; delete n[id]; return n; });
    },
    addVersion: (id, note) => setDocs((ds) => ds.map((d) => {
      if (d.id !== id) return d;
      const at = new Date().toISOString();
      return { ...d, modifiedAt: at, versions: [...d.versions, { v: d.versions.length + 1, at, by: userId, size: d.size, note }] };
    })),
    setGrant: (docId, uid, perm) => setGrants((g) => {
      const forDoc = { ...(g[docId] ?? {}) };
      if (perm) forDoc[uid] = perm; else delete forDoc[uid];
      return { ...g, [docId]: forDoc };
    }),
  }), [user, docs, grants, audit, setPersona, resetDemo, log, userId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo outside DemoProvider");
  return c;
}
