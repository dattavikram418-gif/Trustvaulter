import { useState, useRef } from "react";
import { Upload, FileText, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { operation, type DocumentRecord } from "@/lib/backend/client";
export interface QuarantineVersion {
  id: string;
  version_number: number;
  filename: string;
  byte_size: number;
  digest: string;
  scan_evidence: string;
  quarantine_state: string;
}
export async function quarantineOperation<T>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { supabase } = await import("@/integrations/supabase/client");
  const session = await supabase.auth.getSession();
  const response = await fetch("/api/public/quarantine", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unavailable");
  return result.data as T;
}
export function QuarantineUpload({
  doc,
  onUploaded,
}: {
  doc?: DocumentRecord;
  onUploaded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choose = (f: File | null) => {
    setFile(f);
    setError("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={doc ? "outline" : "default"}>
          <Upload />
          {doc ? "Add version" : "Upload document"}
        </Button>
      </DialogTrigger>
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogTitle>{doc ? "Add a quarantined version" : "Upload a document"}</DialogTitle>
        <DialogDescription>
          PDF, PNG, JPEG or TXT · Up to 10 MB. Files remain private and unreadable in quarantine.
          Scanning is not configured.
        </DialogDescription>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const parent =
                doc ?? (await operation<DocumentRecord>("create", { name: file.name, category }));
              const ticket = await quarantineOperation<{ reservation_id: string }>("reserve", {
                id: parent.id,
                revision: parent.acl_revision,
              });
              const { supabase } = await import("@/integrations/supabase/client");
              const session = await supabase.auth.getSession();
              const response = await fetch(
                `/api/public/quarantine?reservation=${ticket.reservation_id}`,
                {
                  method: "PUT",
                  headers: {
                    Authorization: `Bearer ${session.data.session?.access_token ?? ""}`,
                    "Content-Type": file.type,
                    "X-Filename": file.name,
                  },
                  body: file,
                },
              );
              const result = await response.json();
              if (!response.ok) throw new Error(result.error ?? "Upload unavailable");
              setOpen(false);
              setFile(null);
              onUploaded();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unavailable");
              onUploaded();
            } finally {
              setBusy(false);
            }
          }}
        >
          <div
            className={`drop-area ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) choose(e.dataTransfer.files[0] ?? null);
            }}
          >
            <input
              ref={input}
              aria-label="Quarantine file"
              className="sr-only"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              disabled={busy}
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <>
                <FileText className="mx-auto size-8 text-primary" />
                <p className="mt-3 break-all text-sm font-medium">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
                <Button
                  type="button"
                  disabled={busy}
                  className="mt-2"
                  variant="ghost"
                  onClick={() => {
                    choose(null);
                    if (input.current) input.current.value = "";
                  }}
                >
                  <X />
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Upload className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Drop a file here</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  type="button"
                  onClick={() => input.current?.click()}
                >
                  Choose file
                </Button>
              </>
            )}
          </div>
          {!doc && (
            <label className="block text-sm font-medium">
              Category
              <input
                value={category}
                maxLength={100}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Optional"
                className="workspace-input mt-2 w-full"
                disabled={busy}
              />
            </label>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole size={14} />
            No preview or download will be enabled.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !file}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
              {busy ? "Storing in quarantine…" : "Store in quarantine"}
            </Button>
          </div>
          {busy && (
            <p role="status" className="text-xs text-muted-foreground">
              Please keep this window open. This upload cannot be cancelled here.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
