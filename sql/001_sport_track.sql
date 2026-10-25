-- sport-track: activities, metrics and declared sessions, in the shared aimeri-unique project.
-- Every object lives in the public schema and is prefixed st_; nothing else is touched.
--  * RLS on every table, policies restricted to the authenticated role, auth.uid() = user_id
--  * a session can only point to an activity of the same user (composite FK),
--    a value only to a session and a metric of the same user (RLS through the parents)
--  * no session in the future (Europe/Paris), one session per activity and per day
--  * functions are SECURITY INVOKER with a fixed search_path, so RLS still applies
-- Applied once with `npx supabase db query --linked -f`, outside the CLI migration history
-- (that history belongs to ideel-like).


-- st_activities ----------------------------------------------------------

create table public.st_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0 and char_length(name) <= 40),
  subtitle text check (char_length(subtitle) <= 80),
  icon text not null check (icon ~ '^[a-z0-9_]{1,40}$'),
  color text not null default 'c1' check (color ~ '^c([1-9]|1[0-2])$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint st_activities_id_user_id_key unique (id, user_id)
);

create index st_activities_user_id_idx on public.st_activities (user_id, position);

-- st_metrics -------------------------------------------------------------

create table public.st_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0 and char_length(name) <= 40),
  type text not null check (type in ('distance', 'duration', 'pace', 'speed', 'sets', 'number')),
  unit text check (char_length(unit) <= 15),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint st_metrics_unit_only_for_number check (unit is null or type = 'number')
);

create index st_metrics_user_id_idx on public.st_metrics (user_id, position);

-- st_sessions ------------------------------------------------------------

create table public.st_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_id uuid not null,
  date date not null,
  description text not null default '' check (char_length(description) <= 250),
  rating smallint not null default 0 check (rating between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- same-owner activity only; deleting an activity deletes its sessions
  constraint st_sessions_activity_fkey
    foreign key (activity_id, user_id)
    references public.st_activities (id, user_id)
    on delete cascade,
  -- several activities a day, never the same one twice
  constraint st_sessions_one_per_activity_per_day unique (user_id, activity_id, date)
);

create index st_sessions_user_date_idx on public.st_sessions (user_id, date);
create index st_sessions_activity_idx on public.st_sessions (activity_id, user_id);

-- st_session_values ------------------------------------------------------
-- value: km (distance), seconds (duration), seconds per km (pace), km/h (speed), free (number).
-- sets/kg/reps: only for the sets type.

create table public.st_session_values (
  session_id uuid not null references public.st_sessions (id) on delete cascade,
  metric_id uuid not null references public.st_metrics (id) on delete cascade,
  value numeric check (value >= 0),
  sets integer check (sets >= 0),
  kg numeric check (kg >= 0),
  reps integer check (reps >= 0),
  primary key (session_id, metric_id),
  constraint st_session_values_not_empty
    check (value is not null or (sets is not null and kg is not null and reps is not null))
);

create index st_session_values_metric_idx on public.st_session_values (metric_id);

-- RLS --------------------------------------------------------------------

alter table public.st_activities enable row level security;
alter table public.st_metrics enable row level security;
alter table public.st_sessions enable row level security;
alter table public.st_session_values enable row level security;

create policy "st_activities_select_own" on public.st_activities
  for select to authenticated using (auth.uid() = user_id);
create policy "st_activities_insert_own" on public.st_activities
  for insert to authenticated with check (auth.uid() = user_id);
create policy "st_activities_update_own" on public.st_activities
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "st_activities_delete_own" on public.st_activities
  for delete to authenticated using (auth.uid() = user_id);

create policy "st_metrics_select_own" on public.st_metrics
  for select to authenticated using (auth.uid() = user_id);
create policy "st_metrics_insert_own" on public.st_metrics
  for insert to authenticated with check (auth.uid() = user_id);
create policy "st_metrics_update_own" on public.st_metrics
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "st_metrics_delete_own" on public.st_metrics
  for delete to authenticated using (auth.uid() = user_id);

create policy "st_sessions_select_own" on public.st_sessions
  for select to authenticated using (auth.uid() = user_id);
create policy "st_sessions_insert_own" on public.st_sessions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "st_sessions_update_own" on public.st_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "st_sessions_delete_own" on public.st_sessions
  for delete to authenticated using (auth.uid() = user_id);

-- values follow their parent session; writes also require a metric of the same user
create policy "st_session_values_select_own" on public.st_session_values
  for select to authenticated using (
    exists (select 1 from public.st_sessions s where s.id = session_id and s.user_id = auth.uid())
  );
create policy "st_session_values_insert_own" on public.st_session_values
  for insert to authenticated with check (
    exists (select 1 from public.st_sessions s where s.id = session_id and s.user_id = auth.uid())
    and exists (select 1 from public.st_metrics m where m.id = metric_id and m.user_id = auth.uid())
  );
create policy "st_session_values_update_own" on public.st_session_values
  for update to authenticated using (
    exists (select 1 from public.st_sessions s where s.id = session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.st_sessions s where s.id = session_id and s.user_id = auth.uid())
    and exists (select 1 from public.st_metrics m where m.id = metric_id and m.user_id = auth.uid())
  );
create policy "st_session_values_delete_own" on public.st_session_values
  for delete to authenticated using (
    exists (select 1 from public.st_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

-- integrity triggers -----------------------------------------------------

create or replace function public.st_sessions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- declarative app: nothing after today, Paris time
  if new.date > (now() at time zone 'Europe/Paris')::date then
    raise exception 'A session cannot be declared in the future' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger st_sessions_guard
  before insert or update on public.st_sessions
  for each row execute function public.st_sessions_guard();

-- RPCs -------------------------------------------------------------------

-- Seeds the starting activities and metrics when the user has no activity yet.
-- Idempotent and safe to call concurrently (two tabs opening the app at once).
create or replace function public.st_ensure_defaults()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('st_defaults:' || auth.uid()::text, 0));

  if exists (select 1 from public.st_activities where user_id = auth.uid()) then
    return;
  end if;

  insert into public.st_activities (user_id, name, subtitle, icon, color, position) values
    (auth.uid(), 'Musculation', 'Bras / pecs', 'fitness_center', 'c7', 0),
    (auth.uid(), 'Musculation', 'Dos / legs', 'exercise', 'c8', 1),
    (auth.uid(), 'Sport collectif', 'Volley', 'sports_volleyball', 'c6', 2),
    (auth.uid(), 'Tennis', null, 'sports_tennis', 'c4', 3),
    (auth.uid(), 'Cardio', 'Running', 'directions_run', 'c1', 4),
    (auth.uid(), 'Yoga', null, 'self_improvement', 'c11', 5);

  if not exists (select 1 from public.st_metrics where user_id = auth.uid()) then
    insert into public.st_metrics (user_id, name, type, position) values
      (auth.uid(), 'Distance run', 'distance', 0),
      (auth.uid(), 'Durée run', 'duration', 1),
      (auth.uid(), 'Allure', 'pace', 2),
      (auth.uid(), 'Vitesse moyenne', 'speed', 3),
      (auth.uid(), 'Exercice biceps', 'sets', 4);
  end if;
end;
$$;

-- Creates or updates a session and replaces all its values in one transaction.
-- p_values: [{"metric_id": uuid, "value": n} | {"metric_id": uuid, "sets": n, "kg": n, "reps": n}]
-- Pace and speed arrive already computed by the app.
create or replace function public.st_save_session(
  p_id uuid,
  p_activity_id uuid,
  p_date date,
  p_description text,
  p_rating smallint,
  p_values jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.st_sessions (activity_id, date, description, rating)
    values (p_activity_id, p_date, coalesce(p_description, ''), coalesce(p_rating, 0))
    returning id into v_id;
  else
    update public.st_sessions
    set activity_id = p_activity_id,
        date = p_date,
        description = coalesce(p_description, ''),
        rating = coalesce(p_rating, 0)
    where id = p_id and user_id = auth.uid()
    returning id into v_id;
    if v_id is null then
      raise exception 'Session not found' using errcode = 'no_data_found';
    end if;
    delete from public.st_session_values where session_id = v_id;
  end if;

  insert into public.st_session_values (session_id, metric_id, value, sets, kg, reps)
  select v_id,
         (x ->> 'metric_id')::uuid,
         (x ->> 'value')::numeric,
         (x ->> 'sets')::integer,
         (x ->> 'kg')::numeric,
         (x ->> 'reps')::integer
  from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) as x;

  return v_id;
end;
$$;

-- grants -----------------------------------------------------------------
-- public grants everything to anon by default: take it back, the app is for signed-in users only.

revoke all on public.st_activities, public.st_metrics, public.st_sessions, public.st_session_values
  from anon, public;
grant select, insert, update, delete
  on public.st_activities, public.st_metrics, public.st_sessions, public.st_session_values
  to authenticated;
grant all
  on public.st_activities, public.st_metrics, public.st_sessions, public.st_session_values
  to service_role;

revoke execute on function
  public.st_sessions_guard(),
  public.st_ensure_defaults(),
  public.st_save_session(uuid, uuid, date, text, smallint, jsonb)
from public, anon, authenticated;

grant execute on function
  public.st_ensure_defaults(),
  public.st_save_session(uuid, uuid, date, text, smallint, jsonb)
to authenticated, service_role;
