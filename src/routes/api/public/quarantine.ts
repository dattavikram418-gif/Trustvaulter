import { createFileRoute } from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/quarantine')({server:{handlers:{
 POST:async({request})=>(await import('@/lib/backend/quarantine.server')).quarantineHandler(request),
 PUT:async({request})=>(await import('@/lib/backend/quarantine.server')).quarantineHandler(request),
 GET:async({request})=>(await import('@/lib/backend/quarantine.server')).quarantineHandler(request),
}}});
