import { Link } from "@tanstack/react-router";
import { formatDate, userById, type AuditEvent } from "@/lib/demo/model";
import { Pill } from "./bits";

export function AuditList({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="px-4 py-6 text-sm text-muted-foreground">No events.</p>;
  return (
    <ul className="divide-y">
      {events.map((e) => (
        <li key={e.id} className="px-4 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
          <Pill tone={e.outcome === "denied" ? "danger" : "ok"}>{e.outcome === "denied" ? "Denied" : "Allowed"}</Pill>
          <span className="font-mono text-xs text-muted-foreground">{e.action}</span>
          <time className="ml-auto whitespace-nowrap text-xs text-muted-foreground" dateTime={e.at}>{formatDate(e.at)}</time>
          </div>
          <span className="mt-1 block break-words">
            <span className="font-medium">{userById(e.actorId)?.email}</span>{" · "}
            {e.docId ? <Link to="/doc/$id" params={{ id: e.docId }} className="hover:text-primary hover:underline">{e.docName}</Link> : <span className="italic text-muted-foreground">{e.docName}</span>}
            <span className="block text-xs text-muted-foreground">{e.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SimulatedNotice() {
  return <Pill tone="sim">Simulated events — integrity not verified</Pill>;
}
