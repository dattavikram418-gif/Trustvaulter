import { createFileRoute } from "@tanstack/react-router";
import { AccessDenied } from "@/components/tv/bits";
import { pageHead } from '@/lib/backend/client';

export const Route = createFileRoute("/access-denied")({
  head: () => pageHead('Access denied',"This resource is unavailable or not accessible to your account."),
  component: () => <AccessDenied />,
});
