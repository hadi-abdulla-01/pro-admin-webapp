-- Create notification_deliveries table to track processed notifications and prevent duplicates
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_deliveries_unique_notification UNIQUE (notification_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_id ON public.notification_deliveries(notification_id);

-- Grant permissions (adjust based on your Supabase auth setup)
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;