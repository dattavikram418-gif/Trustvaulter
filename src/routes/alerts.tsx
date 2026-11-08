import { createFileRoute } from "@tanstack/react-router";
import { SignInAlerts } from "@/components/tv/SignInAlerts";
import { pageHead } from "@/lib/backend/client";
export const Route = createFileRoute("/alerts")({
  head: () => pageHead("Sign-in alerts", "Successful sign-ins and refused ended sessions for your TrustVault account."),
  component: SignInAlerts,
});
