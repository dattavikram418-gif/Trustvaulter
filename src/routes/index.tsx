import { createFileRoute } from '@tanstack/react-router';
import { MetadataList } from '@/components/tv/MetadataList';
import { pageHead } from '@/lib/backend/client';
export const Route = createFileRoute('/')({ head: () => pageHead('Overview','TrustVault private document overview and quarantined uploads. Delivery blocked.'), component: () => <MetadataList title="Overview" scope="all" /> });
