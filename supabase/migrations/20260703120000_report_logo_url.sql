ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS report_logo_url text;

COMMENT ON COLUMN public.agencies.report_logo_url IS 'Logo used on PPT/PDF report cover slides (PPT Report Download page)';
