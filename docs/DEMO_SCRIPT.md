# Demo walkthrough (real flows)

No video has been recorded and no credentials are supplied. The operator provisions four synthetic accounts first (README → Provisioning): **owner** (document_creator), **reader** and **outsider** (viewer), **admin** (administrator). Use only synthetic files.

1. **Sign in as owner** at `/auth`. Overview shows real counts from the backend.
2. **Upload** a small TXT or PNG on My documents. Show a rejected 11 MB file or wrong type. The new document shows its version as *quarantined*.
3. **Open the document** (`/doc/<id>`): metadata, versions and activity. The download button explains delivery is closed.
4. **Share** with reader's account ID as Read; then change to Edit. Activity shows both grants.
5. **Sign in as reader** (other browser): the document appears under Shared with me; reader sees metadata, cannot share or delete.
6. **Sign in as outsider** and open the same `/doc/<id>` URL: access denied page, no title leaked.
7. **Owner revokes** reader (confirm dialog). Reader's next refresh loses the document immediately.
8. **Sign in as admin** → Security activity (`/admin`): filter to Permission changes, see reader's grant Read → Edit → none with sequence, time, request ID; filter Denied to see outsider's attempt. Opening the document itself as admin is still denied.
9. **Owner deletes** the document; it disappears from lists, and audit history remains.
10. Close by naming the limits: no preview/download, no real scanner, audit not externally anchored.
