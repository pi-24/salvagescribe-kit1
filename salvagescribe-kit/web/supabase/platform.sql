begin;

create table if not exists public.scribe_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  part_id text not null,
  ledger jsonb not null check (jsonb_typeof(ledger) = 'object'),
  draft jsonb,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  unique(owner_id, part_id)
);
create table if not exists public.scribe_evidence (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.scribe_records(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  attribute text not null,
  candidate jsonb not null
);
create table if not exists public.scribe_events (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.scribe_records(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  revision integer not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.scribe_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references public.scribe_records(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  created_at timestamptz not null default now(),
  check (owner_id <> recipient_id),
  unique(record_id, recipient_id)
);
create table if not exists public.scribe_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.scribe_threads(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  kind text not null default 'text' check (kind in ('text', 'offer', 'audio')),
  amount numeric(12,2) check (amount > 0),
  attachment text,
  created_at timestamptz not null default now(),
  check (kind <> 'offer' or amount is not null)
);
create index if not exists scribe_evidence_record_idx on public.scribe_evidence(record_id);
create index if not exists scribe_events_record_idx on public.scribe_events(record_id, created_at desc);
create index if not exists scribe_messages_thread_idx on public.scribe_messages(thread_id, created_at);

alter table public.scribe_records enable row level security;
alter table public.scribe_evidence enable row level security;
alter table public.scribe_events enable row level security;
alter table public.scribe_threads enable row level security;
alter table public.scribe_messages enable row level security;

drop policy if exists own_records on public.scribe_records;
create policy own_records on public.scribe_records for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists own_evidence on public.scribe_evidence;
create policy own_evidence on public.scribe_evidence for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists own_events on public.scribe_events;
create policy own_events on public.scribe_events for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists thread_read on public.scribe_threads;
create policy thread_read on public.scribe_threads for select to authenticated using ((select auth.uid()) in (owner_id, recipient_id));
drop policy if exists thread_create on public.scribe_threads;
create policy thread_create on public.scribe_threads for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists(select 1 from public.scribe_records r where r.id = record_id and r.owner_id = (select auth.uid()))
);
drop policy if exists message_read on public.scribe_messages;
create policy message_read on public.scribe_messages for select to authenticated using (
  exists(select 1 from public.scribe_threads t where t.id = thread_id and (select auth.uid()) in (t.owner_id, t.recipient_id))
);
drop policy if exists message_create on public.scribe_messages;
create policy message_create on public.scribe_messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and exists(select 1 from public.scribe_threads t where t.id = thread_id and (select auth.uid()) in (t.owner_id, t.recipient_id))
  and (attachment is null or attachment like (select auth.uid())::text || '/%')
);

revoke all on public.scribe_records, public.scribe_evidence, public.scribe_events, public.scribe_threads, public.scribe_messages from anon;
revoke all on public.scribe_records, public.scribe_evidence, public.scribe_events from authenticated;
grant select on public.scribe_records, public.scribe_evidence, public.scribe_events to authenticated;
grant select, insert on public.scribe_threads, public.scribe_messages to authenticated;

create or replace function public.scribe_commit(
  p_part_id text, p_revision integer, p_ledger jsonb, p_draft jsonb,
  p_operation text, p_payload jsonb default '{}'
) returns public.scribe_records
language plpgsql security definer set search_path = '' as $$
declare
  result public.scribe_records;
  field record;
  candidate jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_part_id !~ '^[A-Z0-9][A-Z0-9-]{1,39}$' or jsonb_typeof(p_ledger->'ledger') <> 'object' then
    raise exception 'Invalid part record' using errcode = '22023';
  end if;
  if p_revision = 0 then
    insert into public.scribe_records(owner_id, part_id, ledger, draft)
    values(auth.uid(), p_part_id, p_ledger, p_draft) returning * into result;
  else
    update public.scribe_records set ledger = p_ledger, draft = p_draft,
      revision = revision + 1, updated_at = now()
    where owner_id = auth.uid() and part_id = p_part_id and revision = p_revision
    returning * into result;
    if not found then raise exception 'Record changed. Refresh before saving.' using errcode = '40001'; end if;
  end if;
  delete from public.scribe_evidence where record_id = result.id and owner_id = auth.uid();
  for field in select * from jsonb_each(p_ledger->'ledger') loop
    for candidate in select * from jsonb_array_elements(coalesce(field.value->'candidates', '[]'::jsonb)) loop
      insert into public.scribe_evidence(record_id, owner_id, attribute, candidate)
      values(result.id, auth.uid(), field.key, candidate);
    end loop;
  end loop;
  insert into public.scribe_events(record_id, owner_id, operation, revision, payload)
  values(result.id, auth.uid(), p_operation, result.revision, coalesce(p_payload, '{}'));
  return result;
end;
$$;
revoke all on function public.scribe_commit(text, integer, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.scribe_commit(text, integer, jsonb, jsonb, text, jsonb) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('scribe-evidence', 'scribe-evidence', false, 8388608,
  array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg'])
on conflict(id) do nothing;
drop policy if exists scribe_upload on storage.objects;
create policy scribe_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'scribe-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists scribe_download on storage.objects;
create policy scribe_download on storage.objects for select to authenticated using (
  bucket_id = 'scribe-evidence' and ((storage.foldername(name))[1] = (select auth.uid())::text
  or exists(select 1 from public.scribe_messages m join public.scribe_threads t on t.id = m.thread_id
    where m.attachment = name and (select auth.uid()) in (t.owner_id, t.recipient_id)))
);

do $$
declare tab text;
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tab in array array['scribe_records','scribe_threads','scribe_messages'] loop
      if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tab) then
        execute format('alter publication supabase_realtime add table public.%I', tab);
      end if;
    end loop;
  end if;
end;
$$;
commit;
