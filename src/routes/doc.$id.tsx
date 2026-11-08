import { createFileRoute } from '@tanstack/react-router';
import { MetadataDetail } from '@/components/tv/MetadataDetail';
import { pageHead } from '@/lib/backend/client';
export const Route = createFileRoute('/doc/$id')({ head: () => pageHead('Document','Authorized document metadata. File content unavailable.'), component: Detail });
function Detail() { const {id} = Route.useParams(); return <MetadataDetail id={id}/>; }
