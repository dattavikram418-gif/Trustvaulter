import { createFileRoute } from '@tanstack/react-router';
import { SecurityActivity } from '@/components/tv/SecurityActivity';
import { pageHead } from '@/lib/backend/client';
export const Route = createFileRoute('/admin')({ head: () => pageHead('Security activity','Minimal security events without inaccessible document titles.'), component: SecurityActivity });
