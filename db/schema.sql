-- JANG schema.
--
-- Two kinds of actor live here. An *owner* is a person who signs in and
-- delegates authority; an *agent* is software that negotiates under a mandate.
-- Agents existed before owners did, and the command-line demos still register
-- agents with owner ids that belong to no account, so agents.owner_id is a
-- plain label rather than a foreign key.

create table if not exists owners (
  owner_id       text primary key,
  clerk_user_id  text unique not null,
  email          text,
  display_name   text,
  -- The owner's Ed25519 public key, in SPKI PEM. The private half is generated
  -- in the browser and never reaches this database.
  public_key     text,
  created_at     timestamptz not null default now()
);

create table if not exists agents (
  agent_id      text primary key,
  owner_id      text not null,
  label         text,
  api_key_hash  text unique not null,
  created_at    timestamptz not null default now()
);
create index if not exists agents_owner_idx on agents (owner_id);

-- One mandate per agent per item: lodging a new one replaces the old.
create table if not exists mandates (
  agent_id    text not null,
  item_id     text not null,
  mandate_id  text not null,
  owner_id    text not null,
  role        text not null,
  body        jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (agent_id, item_id)
);
create index if not exists mandates_owner_idx on mandates (owner_id);

create table if not exists sessions (
  session_id       text primary key,
  item_spec        jsonb not null,
  buyer_agent_id   text not null,
  seller_agent_id  text not null,
  -- Both mandates, keyed by agent id. Private: only ever read back through
  -- redactSessionFor, which strips the counterparty's copy.
  mandates         jsonb not null,
  status           text not null,
  max_rounds       integer not null,
  expires_at       timestamptz not null,
  created_at       timestamptz not null,
  updated_at       timestamptz not null default now(),
  agreement_id     text,
  accepted_by      jsonb
);
create index if not exists sessions_status_idx on sessions (status, updated_at desc);
create index if not exists sessions_buyer_idx on sessions (buyer_agent_id);
create index if not exists sessions_seller_idx on sessions (seller_agent_id);

-- Offers are rows rather than a blob inside the session, because this table is
-- the event stream the live views tail.
create table if not exists offers (
  offer_id       text primary key,
  session_id     text not null references sessions (session_id) on delete cascade,
  from_agent_id  text not null,
  round          integer not null,
  terms          jsonb not null,
  note           text,
  created_at     timestamptz not null
);
create index if not exists offers_session_idx on offers (session_id, round);
-- MESO: extra packages put on the table in the same turn, each with its own
-- offerId. Null on every offer that has none, including all older rows.
alter table offers add column if not exists alternatives jsonb;

create table if not exists agreements (
  agreement_id  text primary key,
  session_id    text not null,
  body          jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists agreements_session_idx on agreements (session_id);

-- Refusals and other notable events, for the operator view. A refusal is the
-- system working, so it is worth keeping rather than only logging.
create table if not exists events (
  id          bigserial primary key,
  session_id  text,
  agent_id    text,
  kind        text not null,
  code        text,
  message     text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists events_created_idx on events (created_at desc);
create index if not exists events_session_idx on events (session_id, created_at desc);
