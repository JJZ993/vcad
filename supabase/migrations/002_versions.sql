-- Document versions table for version history
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  version_number int not null,
  content jsonb not null,
  device_modified_at bigint not null,
  created_at timestamptz default now()
);

-- Indexes
create index versions_document_id_idx on document_versions(document_id);
create index versions_document_version_idx on document_versions(document_id, version_number desc);

-- Row Level Security
alter table document_versions enable row level security;

-- Users can view versions of their own documents
create policy "Users can view own versions"
  on document_versions for select
  using (
    document_id in (select id from documents where user_id = auth.uid())
  );

-- Trigger to auto-create version on document update
create or replace function create_document_version()
returns trigger as $$
begin
  -- Only create version if content actually changed
  if old.content is distinct from new.content then
    insert into document_versions (
      document_id,
      version_number,
      content,
      device_modified_at
    ) values (
      old.id,
      old.version,
      old.content,
      old.device_modified_at
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger document_version_trigger
  before update on documents
  for each row execute function create_document_version();
