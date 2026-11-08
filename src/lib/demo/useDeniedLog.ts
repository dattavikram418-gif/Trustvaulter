import { useEffect, useRef } from "react";
import type { AuditAction } from "./model";
import { useDemo } from "./store";

/** Records one simulated denied event per (persona, target) while the denied view is shown. */
export function useDeniedLog(denied: boolean, target: { id: string; name: string }, action: AuditAction, detail: string) {
  const { user, log } = useDemo();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const key = `${user.id}:${target.id}`;
    if (!denied || seen.current === key) return;
    seen.current = key;
    log({ action, doc: target, outcome: "denied", detail });
  }, [denied, user.id, target.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
