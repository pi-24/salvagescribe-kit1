-- SalvageScribe — Supabase / PostgreSQL schema
-- Run in the Supabase SQL editor. The prototype's in-memory store maps 1:1
-- onto these tables; set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to mirror
-- every mutation in real time.

-- Inventory parts: ledger is the canonical provenance JSON per part
create table if not exists parts (
  part_id         text primary key,
  ledger_json     jsonb not null,
  classification  text,
  updated_at      timestamptz not null default now()
);

-- Listing drafts (never auto-published; approval gate lives in the app)
create table if not exists listing_drafts (
  part_id          text primary key references parts(part_id) on delete cascade,
  title            text,
  description_md   text,
  category         text,
  item_specifics   jsonb,
  condition_disclosure jsonb,
  compatibility    jsonb,
  seller_edits     jsonb,
  approved         boolean not null default false,
  updated_at       timestamptz not null default now()
);

-- Provenance mapping: every extracted attribute keeps its source attribution
create table if not exists provenance (
  id          bigint generated always as identity primary key,
  part_id     text not null references parts(part_id) on delete cascade,
  attribute   text not null,
  value       text,
  source      text not null,        -- spreadsheet | dismantling_note | photo | photo_label | seller_confirmed | model_inference
  source_ref  text,
  confidence  numeric,
  created_at  timestamptz not null default now()
);

-- AI audit trail: every GLM-5 call is logged with its guardrail outcome
create table if not exists ai_audit_trail (
  id           bigint generated always as identity primary key,
  part_id      text,
  operation    text not null,       -- ingest | questions | draft | assistant
  model        text,
  mock         boolean not null default false,
  guardrails   jsonb,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists provenance_part_idx on provenance(part_id);
create index if not exists audit_part_idx on ai_audit_trail(part_id);

alter table parts            enable row level security;
alter table listing_drafts   enable row level security;
alter table provenance       enable row level security;
alter table ai_audit_trail   enable row level security;

-- Prototype policies: any authenticated seller (Noor) has full access.
create policy "authenticated parts access"
  on parts for all to authenticated using (true) with check (true);
create policy "authenticated drafts access"
  on listing_drafts for all to authenticated using (true) with check (true);
create policy "authenticated provenance access"
  on provenance for all to authenticated using (true) with check (true);
create policy "authenticated audit access"
  on ai_audit_trail for all to authenticated using (true) with check (true);
