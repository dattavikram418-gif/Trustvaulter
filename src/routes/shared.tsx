import { createFileRoute } from '@tanstack/react-router';
import { MetadataList } from '@/components/tv/MetadataList';
import { pageHead } from '@/lib/backend/client';
export const Route = createFileRoute('/shared')({ head: () => pageHead('Shared with me','Explicitly shared TrustVault metadata and quarantined version records. Delivery blocked.'), component: () => <MetadataList title="Shared with me" scope="shared" /> });
