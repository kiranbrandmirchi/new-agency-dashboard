-- TikTok Marketing API sometimes returns access_token + advertiser_ids without refresh_token.
-- Store short-lived access token + expiry for sync until user reconnects.
ALTER TABLE public.agency_platform_credentials
  ADD COLUMN IF NOT EXISTS oauth_access_token text,
  ADD COLUMN IF NOT EXISTS oauth_token_expires_at timestamp with time zone;

COMMENT ON COLUMN public.agency_platform_credentials.oauth_access_token IS 'OAuth access token when refresh_token is not issued (e.g. some TikTok Marketing API advertiser OAuth responses).';
COMMENT ON COLUMN public.agency_platform_credentials.oauth_token_expires_at IS 'When oauth_access_token should be treated as expired; null if using refresh_token only.';
