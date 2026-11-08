import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES, USERS, formatBytes, formatDay, grantOf, isOwner, userById, type Doc } from "@/lib/demo/model";
import { useDemo } from "@/lib/demo/store";
import { AccessBadge, ClassBadge, Empty } from "./bits";

type SortKey = "name" | "modifiedAt" | "size";
const blank = { q: "", owner: "", category: "", from: "", to: "" };
const field = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function DocTable({ docs, emptyTitle, emptyHint }: { docs: Doc[]; emptyTitle: string; emptyHint?: string }) {
  const { user, grants } = useDemo();
  const [f, setF] = useState(blank);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "modifiedAt", dir: -1 });
  const active = Object.values(f).some(Boolean);

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return docs
      .filter((d) => !q || d.name.toLowerCase().includes(q))
      .filter((d) => !f.owner || d.ownerId === f.owner)
      .filter((d) => !f.category || d.category === f.category)
      .filter((d) => !f.from || d.modifiedAt.slice(0, 10) >= f.from)
      .filter((d) => !f.to || d.modifiedAt.slice(0, 10) <= f.to)
      .sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir);
  }, [docs, f, sort]);

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-3 py-2 font-medium">
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  if (docs.length === 0) return <Empty title={emptyTitle}>{emptyHint}</Empty>;

  return (
    <div className="space-y-3">
      <div role="search" className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-52 flex-1">
          <label htmlFor="q" className="sr-only">Search by name</label>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input id="q" value={f.q} onChange={set("q")} placeholder="Search by name" className="bg-card pl-8" />
        </div>
        <label className="text-xs text-muted-foreground">Owner<br />
          <select value={f.owner} onChange={set("owner")} className={field}><option value="">Any</option>{USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </label>
        <label className="text-xs text-muted-foreground">Category<br />
          <select value={f.category} onChange={set("category")} className={field}><option value="">Any</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="text-xs text-muted-foreground">Modified from<br /><input type="date" value={f.from} onChange={set("from")} className={field} /></label>
        <label className="text-xs text-muted-foreground">to<br /><input type="date" value={f.to} onChange={set("to")} className={field} /></label>
        <Button variant="ghost" size="sm" className="h-9" disabled={!active} onClick={() => setF(blank)}><RotateCcw /> Reset</Button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">{rows.length} of {docs.length} documents</p>
      {rows.length === 0 ? (
        <Empty title="No documents match these filters"><button className="text-primary hover:underline" onClick={() => setF(blank)}>Reset filters</button></Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {th("name", "Name")}
                <th scope="col" className="px-3 py-2 font-medium">Owner</th>
                <th scope="col" className="px-3 py-2 font-medium">Category</th>
                <th scope="col" className="px-3 py-2 font-medium">Classification</th>
                <th scope="col" className="px-3 py-2 font-medium">Your access</th>
                {th("modifiedAt", "Modified")}
                {th("size", "Size")}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2"><Link to="/doc/$id" params={{ id: d.id }} className="font-medium hover:text-primary hover:underline">{d.name}</Link></td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{userById(d.ownerId)?.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.category}</td>
                  <td className="px-3 py-2"><ClassBadge c={d.classification} /></td>
                  <td className="px-3 py-2"><AccessBadge access={isOwner(user, d) ? "owner" : grantOf(grants, user, d) ?? "metadata"} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDay(d.modifiedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{formatBytes(d.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
