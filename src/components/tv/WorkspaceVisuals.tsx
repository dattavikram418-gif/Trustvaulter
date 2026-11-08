import { FileText, FolderLock, ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentRecord } from "@/lib/backend/client";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="brand-mark">
        <FolderLock size={20} />
      </span>
      {!compact && (
        <span className="text-lg font-semibold">
          TrustVault
          <span className="block text-[10px] font-medium text-muted-foreground">
            Private workspace
          </span>
        </span>
      )}
    </div>
  );
}
export function VaultArtwork() {
  return (
    <div className="vault-art" aria-hidden="true">
      <div className="vault-frame">
        <div className="vault-sheet sheet-back">
          <div className="sheet-lines" />
        </div>
        <div className="vault-sheet sheet-mid">
          <div className="sheet-lines" />
        </div>
        <div className="vault-sheet sheet-front">
          <FileText size={32} />
          <div className="sheet-lines" />
          <div className="sheet-seal">
            <LockKeyhole size={24} />
          </div>
        </div>
        <div className="vault-lock">
          <FolderLock size={36} />
        </div>
      </div>
      <span className="vault-caption">A place for what matters.</span>
    </div>
  );
}
export function FileIcon({ name, large = false }: { name: string; large?: boolean }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const kind = ext && ["pdf", "png", "jpg", "jpeg", "txt"].includes(ext) ? ext : "doc";
  return (
    <span
      className={`file-icon ${large ? "file-icon-large" : ""} ${kind === "pdf" ? "file-pdf" : kind === "txt" ? "file-text" : "file-general"}`}
    >
      <FileText size={large ? 32 : 20} />
      <span>{kind === "jpeg" ? "jpg" : kind}</span>
    </span>
  );
}
export function DocumentBadges({ doc }: { doc: DocumentRecord }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`status-badge ${doc.access === "owner" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}
      >
        {doc.access === "owner" ? "Owner" : doc.access === "edit" ? "Can edit" : "Read only"}
      </span>
      <span className="status-badge bg-secondary text-secondary-foreground">
        {doc.lifecycle === "quarantined" ? "Quarantined" : "Draft · No file"}
      </span>
    </div>
  );
}
export function LoadSkeleton() {
  return (
    <div role="status" aria-label="Checking current access" className="space-y-3 py-6">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="flex items-center gap-4 border-b py-4">
          <div className="skeleton size-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-2/5 rounded" />
            <div className="skeleton h-3 w-1/4 rounded" />
          </div>
        </div>
      ))}
      <span className="sr-only">Checking current access…</span>
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="py-14 text-center">
      <FolderLock className="mx-auto mb-4 size-8 text-muted-foreground" />
      <h2 className="font-semibold">Unable to load this view</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-5" onClick={onRetry}>
        <ArrowUpRight />
        Try again
      </Button>
    </div>
  );
}
