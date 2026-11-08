import { Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CATEGORIES, formatBytes, validateUpload } from "@/lib/demo/model";
import { useDemo } from "@/lib/demo/store";

export function UploadDialog() {
  const { user, addDoc, log } = useDemo();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; type: string; size: number } | null>(null);
  const [category, setCategory] = useState<string>(CATEGORIES[0]!);
  const [classification, setClassification] = useState<"Internal" | "Confidential" | "Restricted">("Internal");
  const [synthetic, setSynthetic] = useState(false);
  const error = file ? validateUpload(file) : null;

  const reset = () => { setFile(null); setSynthetic(false); setCategory(CATEGORIES[0]!); setClassification("Internal"); };

  const submit = () => {
    if (!file || error || !synthetic) return;
    const at = new Date().toISOString();
    const doc = { id: `d-${Date.now()}`, name: file.name, ownerId: user.id, category, mime: file.type, size: file.size, createdAt: at, modifiedAt: at, classification, versions: [{ v: 1, at, by: user.id, size: file.size, note: "Initial upload" }] };
    addDoc(doc);
    log({ action: "upload", doc, outcome: "allowed", detail: `Metadata recorded (${formatBytes(file.size)}); bytes discarded in prototype` });
    toast.success("Added to My documents (demo)", { description: "Only metadata was kept. No file was stored or transmitted." });
    reset(); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button><Upload /> Upload</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document (demo)</DialogTitle>
          <DialogDescription>Allowlist: PDF, JPEG, PNG, TXT · max 10 MB. The prototype reads only name, type and size; file bytes are never stored or sent anywhere.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="file" className="text-sm font-medium">File</label>
            <input id="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain"
              aria-describedby="file-msg"
              onChange={(e) => { const f = e.target.files?.[0]; setFile(f ? { name: f.name, type: f.type, size: f.size } : null); }}
              className="mt-1 block w-full rounded-md border border-input bg-card p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1" />
            <p id="file-msg" role={error ? "alert" : undefined} className={`mt-1 text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
              {error ?? (file ? `${file.type} · ${formatBytes(file.size)} — passes demo validation` : "No file selected")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">Category
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-card px-2 text-sm font-normal">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="text-sm font-medium">Classification
              <select value={classification} onChange={(e) => setClassification(e.target.value as typeof classification)} className="mt-1 block h-9 w-full rounded-md border border-input bg-card px-2 text-sm font-normal"><option>Internal</option><option>Confidential</option><option>Restricted</option></select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Categories organise documents only; they do not grant or inherit access.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
            I confirm this is a synthetic test file, not real confidential data.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!file || !!error || !synthetic}>Add to demo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
