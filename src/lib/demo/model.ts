// SYNTHETIC DEMO MODEL — prototype only. These checks drive UI affordances in
// local state; they are NOT a security boundary. The backend must re-enforce all of it.

export type Role = "admin" | "member";
export type Permission = "read" | "edit";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string;
}

export interface Version {
  v: number;
  at: string;
  by: string;
  size: number;
  note: string;
}

export interface Doc {
  id: string;
  name: string;
  ownerId: string;
  category: string;
  mime: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  classification: "Internal" | "Confidential" | "Restricted";
  versions: Version[];
}

export type Grants = Record<string, Record<string, Permission>>; // docId -> userId -> perm

export type AuditAction =
  | "view"
  | "upload"
  | "new_version"
  | "grant"
  | "change_permission"
  | "revoke"
  | "delete"
  | "download_attempt";

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  action: AuditAction;
  docId: string;
  docName: string; // captured at event time; redacted at render for unauthorised viewers
  outcome: "allowed" | "denied";
  detail: string;
}

export const USERS: User[] = [
  { id: "u-admin", email: "admin@trustvault.test", name: "Avery Admin", role: "admin", title: "Security administrator" },
  { id: "u-owner", email: "owner@trustvault.test", name: "Olivia Owner", role: "member", title: "Finance lead" },
  { id: "u-viewer", email: "viewer@trustvault.test", name: "Victor Viewer", role: "member", title: "Analyst" },
  { id: "u-outsider", email: "outsider@trustvault.test", name: "Oscar Outsider", role: "member", title: "Contractor" },
];

export const CATEGORIES = ["Finance", "Legal", "HR", "Engineering", "Operations"];

export const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "text/plain": [".txt"],
};
export const MAX_BYTES = 10 * 1024 * 1024;

export const userById = (id: string) => USERS.find((u) => u.id === id);

const v = (n: number, at: string, by: string, size: number, note: string): Version => ({ v: n, at, by, size, note });

export function initialDocs(): Doc[] {
  return [
    { id: "d-101", name: "Q3 Budget Forecast.pdf", ownerId: "u-owner", category: "Finance", mime: "application/pdf", size: 2_400_000, createdAt: "2026-09-02T09:12:00Z", modifiedAt: "2026-10-28T14:05:00Z", classification: "Confidential", versions: [v(1, "2026-09-02T09:12:00Z", "u-owner", 2_100_000, "Initial upload"), v(2, "2026-10-28T14:05:00Z", "u-viewer", 2_400_000, "Updated revenue assumptions")] },
    { id: "d-102", name: "Vendor MSA Draft.pdf", ownerId: "u-owner", category: "Legal", mime: "application/pdf", size: 880_000, createdAt: "2026-10-10T11:00:00Z", modifiedAt: "2026-10-10T11:00:00Z", classification: "Restricted", versions: [v(1, "2026-10-10T11:00:00Z", "u-owner", 880_000, "Initial upload")] },
    { id: "d-103", name: "Onboarding Checklist.txt", ownerId: "u-owner", category: "HR", mime: "text/plain", size: 12_400, createdAt: "2026-08-15T08:30:00Z", modifiedAt: "2026-10-01T16:20:00Z", classification: "Internal", versions: [v(1, "2026-08-15T08:30:00Z", "u-owner", 11_000, "Initial upload"), v(2, "2026-10-01T16:20:00Z", "u-owner", 12_400, "Added laptop step")] },
    { id: "d-104", name: "Network Diagram.png", ownerId: "u-owner", category: "Engineering", mime: "image/png", size: 1_650_000, createdAt: "2026-10-20T13:45:00Z", modifiedAt: "2026-10-20T13:45:00Z", classification: "Confidential", versions: [v(1, "2026-10-20T13:45:00Z", "u-owner", 1_650_000, "Initial upload")] },
    { id: "d-105", name: "Board Minutes Oct.pdf", ownerId: "u-owner", category: "Legal", mime: "application/pdf", size: 540_000, createdAt: "2026-10-29T17:00:00Z", modifiedAt: "2026-10-29T17:00:00Z", classification: "Restricted", versions: [v(1, "2026-10-29T17:00:00Z", "u-owner", 540_000, "Initial upload")] },
    { id: "d-201", name: "Site Inspection Photo.jpg", ownerId: "u-viewer", category: "Operations", mime: "image/jpeg", size: 3_100_000, createdAt: "2026-10-18T10:10:00Z", modifiedAt: "2026-10-18T10:10:00Z", classification: "Internal", versions: [v(1, "2026-10-18T10:10:00Z", "u-viewer", 3_100_000, "Initial upload")] },
  ];
}

export function initialGrants(): Grants {
  return {
    "d-101": { "u-viewer": "edit" },
    "d-103": { "u-viewer": "read", "u-outsider": "read" },
    "d-104": { "u-viewer": "read" },
    "d-201": { "u-owner": "read" },
  };
}

export function initialAudit(): AuditEvent[] {
  return [
    { id: "e-1", at: "2026-10-31T08:02:00Z", actorId: "u-viewer", action: "view", docId: "d-101", docName: "Q3 Budget Forecast.pdf", outcome: "allowed", detail: "Opened detail page" },
    { id: "e-2", at: "2026-10-31T08:15:00Z", actorId: "u-viewer", action: "view", docId: "d-105", docName: "Board Minutes Oct.pdf", outcome: "denied", detail: "No grant on document" },
    { id: "e-3", at: "2026-10-31T09:40:00Z", actorId: "u-owner", action: "grant", docId: "d-104", docName: "Network Diagram.png", outcome: "allowed", detail: "Granted Read to viewer@trustvault.test" },
    { id: "e-4", at: "2026-10-31T10:05:00Z", actorId: "u-outsider", action: "view", docId: "d-102", docName: "Vendor MSA Draft.pdf", outcome: "denied", detail: "No grant on document" },
    { id: "e-5", at: "2026-10-31T11:30:00Z", actorId: "u-owner", action: "change_permission", docId: "d-101", docName: "Q3 Budget Forecast.pdf", outcome: "allowed", detail: "viewer@trustvault.test: Read → Edit" },
    { id: "e-6", at: "2026-10-31T12:10:00Z", actorId: "u-viewer", action: "delete", docId: "d-101", docName: "Q3 Budget Forecast.pdf", outcome: "denied", detail: "Edit does not grant delete" },
  ];
}

// ---- Permission rules (UI-level mirror of the intended backend policy) ----
export const isOwner = (u: User, d: Doc) => d.ownerId === u.id;
export const grantOf = (g: Grants, u: User, d: Doc): Permission | undefined => g[d.id]?.[u.id];
/** Content access. Admin role does NOT confer content access. */
export const canRead = (g: Grants, u: User, d: Doc) => isOwner(u, d) || !!grantOf(g, u, d);
export const canEdit = (g: Grants, u: User, d: Doc) => isOwner(u, d) || grantOf(g, u, d) === "edit";
/** Share / manage access and delete are owner-only; Edit never implies them. */
export const canManageAccess = (u: User, d: Doc) => isOwner(u, d);
export const canDelete = (u: User, d: Doc) => isOwner(u, d);
/** Security metadata (owner, ACL, classification, versions) — admin oversight without content. */
export const canSeeSecurityMetadata = (g: Grants, u: User, d: Doc) => u.role === "admin" || canRead(g, u, d);
export const canViewAuditConsole = (u: User) => u.role === "admin";

/** Event visibility on the overview panel; titles of unreadable docs are redacted. */
export function visibleEvent(g: Grants, docs: Doc[], u: User, e: AuditEvent): AuditEvent | null {
  const doc = docs.find((d) => d.id === e.docId);
  if (u.role === "admin") return e;
  const relevant = e.actorId === u.id || (doc && isOwner(u, doc));
  if (!relevant) return null;
  const readable = doc ? canRead(g, u, doc) : false;
  return readable ? e : { ...e, docName: "Restricted document", docId: "" };
}

export function validateUpload(file: { name: string; type: string; size: number }): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const allowedExts = ALLOWED_TYPES[file.type];
  if (!allowedExts) return `File type "${file.type || "unknown"}" is not on the demo allowlist (PDF, JPEG, PNG, TXT).`;
  if (!allowedExts.includes(ext)) return `Extension "${ext}" does not match declared type ${file.type}.`;
  if (file.size === 0) return "File is empty.";
  if (file.size > MAX_BYTES) return `File is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB.`;
  return null;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
