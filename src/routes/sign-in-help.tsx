import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/backend/client";

export const Route = createFileRoute("/sign-in-help")({
  head: () =>
    pageHead(
      "Sign-in help",
      "How TrustVault access works: verified self-service signup, least-privilege roles, and how the demo persona selector differs from real sign-in.",
    ),
  component: SignInHelp,
});

function SignInHelp() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-3xl font-semibold">Sign-in help</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        How access to this TrustVault prototype works.
      </p>

      <section className="mt-8 space-y-3 border-t py-6">
        <h2 className="text-base font-semibold">Create an account with a verified email</h2>
        <p className="text-sm text-muted-foreground">
          Choose "Create an account" on the sign-in page. We email you a verification link; until you
          open it you cannot sign in. Once verified, your account can add its own documents and share
          them with named people by their verified email address, as Read or Edit.
        </p>
      </section>

      <section className="space-y-3 border-t py-6">
        <h2 className="text-base font-semibold">Roles are never chosen at signup</h2>
        <p className="text-sm text-muted-foreground">
          Signup only collects an email and password. The administrator role is assigned by the
          operator, never by the person signing up, and administrators still cannot open other
          people's documents. Accounts created by an operator start as viewers.
        </p>
      </section>

      <section className="space-y-3 border-t py-6">
        <h2 className="text-base font-semibold">The demo persona selector is not sign-in</h2>
        <p className="text-sm text-muted-foreground">
          The separate synthetic interface prototype has a "View interface as persona" selector
          (admin@trustvault.test, owner@trustvault.test, viewer@trustvault.test,
          outsider@trustvault.test). It only switches synthetic sample data for interface
          demonstration. It is <strong>not authentication</strong>: it grants no access, enforces no
          security, and resets on refresh. The demo emails are not working credentials and cannot be
          used on the real sign-in form.
        </p>
      </section>

      <section className="space-y-3 border-t py-6">
        <h2 className="text-base font-semibold">Prototype status</h2>
        <p className="text-sm text-muted-foreground">
          This is a security-challenge prototype. Document previews and downloads are disabled while
          quarantine, scanning, and delivery controls remain under review.
        </p>
      </section>

      <p className="mt-8 text-sm">
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          Back to workspace
        </Link>
      </p>
    </div>
  );
}
