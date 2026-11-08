import { describe, expect, it } from "vitest";
import { type User, MAX_BYTES, USERS, canDelete, canEdit, canManageAccess, canRead, canSeeSecurityMetadata, initialAudit, initialDocs, initialGrants, validateUpload, visibleEvent } from "./model";

const [admin, owner, viewer, outsider] = USERS as [User, User, User, User];
const docs = initialDocs();
const g = initialGrants();
const doc = (id: string) => docs.find((d) => d.id === id)!;

describe("demo permission rules", () => {
  it("edit grant allows edit but not share or delete", () => {
    expect(canEdit(g, viewer, doc("d-101"))).toBe(true);
    expect(canManageAccess(viewer, doc("d-101"))).toBe(false);
    expect(canDelete(viewer, doc("d-101"))).toBe(false);
  });
  it("read grant does not allow edit", () => {
    expect(canRead(g, viewer, doc("d-104"))).toBe(true);
    expect(canEdit(g, viewer, doc("d-104"))).toBe(false);
  });
  it("admin sees metadata but not content without a grant", () => {
    expect(canSeeSecurityMetadata(g, admin, doc("d-105"))).toBe(true);
    expect(canRead(g, admin, doc("d-105"))).toBe(false);
  });
  it("outsider cannot read ungranted docs", () => {
    expect(canRead(g, outsider, doc("d-102"))).toBe(false);
  });
  it("revoking removes read access", () => {
    const after = { ...g, "d-104": {} };
    expect(canRead(after, viewer, doc("d-104"))).toBe(false);
  });
  it("viewer's denied event does not leak the title", () => {
    const denied = initialAudit().find((e) => e.id === "e-2")!;
    expect(visibleEvent(g, docs, viewer, denied)?.docName).toBe("Restricted document");
  });
  it("owner can manage and delete own doc", () => {
    expect(canManageAccess(owner, doc("d-101")) && canDelete(owner, doc("d-101"))).toBe(true);
  });
});

describe("upload validation", () => {
  it("accepts a 10 MB PDF", () => expect(validateUpload({ name: "a.pdf", type: "application/pdf", size: MAX_BYTES })).toBeNull());
  it("rejects over 10 MB", () => expect(validateUpload({ name: "a.pdf", type: "application/pdf", size: MAX_BYTES + 1 })).not.toBeNull());
  it("rejects disallowed type", () => expect(validateUpload({ name: "a.exe", type: "application/x-msdownload", size: 10 })).not.toBeNull());
  it("rejects mismatched extension", () => expect(validateUpload({ name: "a.pdf", type: "image/png", size: 10 })).not.toBeNull());
});
