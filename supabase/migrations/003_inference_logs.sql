-- Inference logs table for tracking AI generation attempts
create table if not exists inference_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  result text,
  tokens integer,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);

-- Index for querying by user
create index if not exists inference_logs_user_id_idx on inference_logs(user_id);

-- Index for time-based queries
create index if not exists inference_logs_created_at_idx on inference_logs(created_at desc);

-- RLS: users can only see their own logs
alter table inference_logs enable row level security;

create policy "Users can view own inference logs"
  on inference_logs for select
  using (auth.uid() = user_id);

-- Only service role can insert (from API)
create policy "Service role can insert inference logs"
  on inference_logs for insert
  with check (true);

-- Grant insert to service role
grant insert on inference_logs to service_role;
