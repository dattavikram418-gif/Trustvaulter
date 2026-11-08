import { createFileRoute } from '@tanstack/react-router';
import { MetadataList } from '@/components/tv/MetadataList';
import { pageHead } from '@/lib/backend/client';
export const Route = createFileRoute('/documents')({ head: () => pageHead('My documents','Your TrustVault drafts and quarantined files. No content delivery.'), component: () => <MetadataList title="My documents" scope="owned" /> });
