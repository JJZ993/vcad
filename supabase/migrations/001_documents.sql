-- Cloud documents table
-- Links back to local IndexedDB via local_id
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  local_id text not null,             -- IndexedDB document ID
  name text not null,
  content jsonb not null,             -- .vcad JSON
  version integer not null,           -- Local version number
  device_modified_at bigint not null, -- Unix timestamp from device
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Unique constraint: one cloud doc per local doc per user
  unique(user_id, local_id)
);

-- Indexes
create index documents_user_id_idx on documents(user_id);
create index documents_local_id_idx on documents(local_id);
create index documents_is_public_idx on documents(is_public) where is_public = true;

-- Row Level Security
alter table documents enable row level security;

-- Users can CRUD their own documents
create policy "Users can manage own documents"
  on documents for all
  using (auth.uid() = user_id);

-- Public documents readable by anyone
create policy "Public documents are viewable"
  on documents for select
  using (is_public = true);

-- Updated at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at
  before update on documents
  for each row execute function update_updated_at();
