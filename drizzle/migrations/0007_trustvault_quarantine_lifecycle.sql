ALTER TABLE public.documents DROP CONSTRAINT documents_lifecycle_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_lifecycle_check CHECK (lifecycle IN ('metadata_draft','quarantined'));
