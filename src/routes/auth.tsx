import { createFileRoute, Link } from '@tanstack/react-router';
import { pageHead } from '@/lib/backend/client';
export const Route = createFileRoute('/auth')({ head: () => pageHead('Sign in','Provisioned account access to TrustVault.'), component: () => <div><h1 className="text-2xl font-semibold">Signed in</h1><Link to="/" className="text-primary">Open overview</Link></div> });
