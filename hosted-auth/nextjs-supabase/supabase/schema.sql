create table if not exists public.namoid_profiles (
  namoid_user_id text primary key,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.namoid_profiles enable row level security;

-- No browser-facing policy is intentionally created. Until NamoID is available
-- as a Supabase third-party JWT issuer, this example accesses the table only
-- through trusted Next.js server code using SUPABASE_SECRET_KEY. Every query
-- derives namoid_user_id from a freshly validated NamoID session.
