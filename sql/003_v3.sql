-- sport-track v3: several sessions a day (max 10), intimate mode, exercises linked to an activity.
--  * st_settings: one row per user (intimate_mode, default true), created by st_ensure_defaults
--  * st_activities.intimate: intimate activities only carry a description and a rating (no values)
--  * st_sessions: at most 10 sessions per user and per day (trigger, serialized per user and day)
--  * st_metrics.activity_id (same-owner activity, set null on delete) and st_metrics.icon
--    (null = icon of the linked activity, else fitness_center); only exercises can be linked,
--    and only to a non-intimate activity without a profile (run / bike / swim / hike icons)
--  * existing exercises whose values all come from sessions of a single activity get linked to it
-- Applied once in a transaction with `npx supabase db query --linked -f`, like 001 and 002.
-- Requires PostgreSQL 15+ (on delete set null with a column list).

begin;


-- st_settings ---------------------------------------------------------------

create table public.st_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  intimate_mode boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.st_settings enable row level security;

create policy "st_settings_select_own" on public.st_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "st_settings_insert_own" on public.st_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "st_settings_update_own" on public.st_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.st_settings from anon, public;
grant select, insert, update on public.st_settings to authenticated;
grant all on public.st_settings to service_role;

-- st_activities.intimate ------------------------------------------------------

alter table public.st_activities
  add column intimate boolean not null default false;

-- st_metrics.activity_id / icon -----------------------------------------------

alter table public.st_metrics
  add column activity_id uuid,
  add column icon text check (icon ~ '^[a-z0-9_]{1,40}$'),
  -- same owner only; deleting the activity only clears the link (user_id stays)
  add constraint st_metrics_activity_fkey
    foreign key (activity_id, user_id)
    references public.st_activities (id, user_id)
    on delete set null (activity_id),
  add constraint st_metrics_link_only_exercises check (profile is null or (activity_id is null and icon is null));

create index st_metrics_activity_idx on public.st_metrics (activity_id, user_id);

-- the link target must be a plain activity (not intimate, no profile icon)
create or replace function public.st_metrics_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.activity_id is not null and exists (
    select 1 from public.st_activities a
    where a.id = new.activity_id
      and (a.intimate or a.icon in ('directions_run', 'sprint', 'directions_bike', 'pool', 'hiking'))
  ) then
    raise exception 'An exercise can only be linked to a plain activity' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger st_metrics_guard
  before insert or update of activity_id on public.st_metrics
  for each row execute function public.st_metrics_guard();

-- an activity that becomes intimate or gets a profile icon loses its exercise links
create or replace function public.st_activities_unlink()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.intimate or new.icon in ('directions_run', 'sprint', 'directions_bike', 'pool', 'hiking') then
    update public.st_metrics set activity_id = null where activity_id = new.id;
  end if;
  return new;
end;
$$;

create trigger st_activities_unlink
  after update of intimate, icon on public.st_activities
  for each row execute function public.st_activities_unlink();

-- st_sessions: 10 a day at most ---------------------------------------------------

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
  if tg_op = 'INSERT' or new.date is distinct from old.date or new.user_id is distinct from old.user_id then
    -- two concurrent inserts on the same day wait for each other
    perform pg_advisory_xact_lock(hashtextextended('st_day:' || new.user_id::text || ':' || new.date::text, 0));
    if (select count(*) from public.st_sessions
        where user_id = new.user_id and date = new.date and id <> new.id) >= 10 then
      raise exception 'At most 10 sessions per day (max_per_day)' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- defaults -----------------------------------------------------------------------

-- Creates the settings row and the missing built-in measures on every call, and the starting
-- activities and exercise when the user has no activity yet. No intimate starting data.
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

  insert into public.st_settings (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  insert into public.st_metrics (user_id, profile, name, type, unit, position)
  select auth.uid(), b.profile, b.name, b.type, b.unit, b.position
  from (values
    ('run',  'Distance',         'distance', null,        0),
    ('run',  'Durée',            'duration', null,        1),
    ('run',  'Allure',           'pace',     null,        2),
    ('run',  'Vitesse moyenne',  'speed',    null,        3),
    ('bike', 'Durée',            'duration', null,        4),
    ('bike', 'Distance',         'distance', null,        5),
    ('bike', 'Vitesse moyenne',  'speed',    null,        6),
    ('swim', 'Durée',            'duration', null,        7),
    ('swim', 'Longueurs',        'number',   'longueurs', 8),
    ('hike', 'Durée',            'duration', null,        9),
    ('hike', 'Distance',         'distance', null,        10),
    ('hike', 'Dénivelé positif', 'number',   'm D+',      11)
  ) as b (profile, name, type, unit, position)
  on conflict (user_id, profile, type) where profile is not null do nothing;

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

  if not exists (select 1 from public.st_metrics where user_id = auth.uid() and profile is null) then
    insert into public.st_metrics (user_id, name, type, position, activity_id)
    select auth.uid(), 'Exercice biceps', 'sets', 100, a.id
    from public.st_activities a
    where a.user_id = auth.uid() and a.position = 0
    limit 1;
  end if;
end;
$$;

-- save: an intimate activity keeps no values ---------------------------------------

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

  if exists (select 1 from public.st_activities where id = p_activity_id and intimate) then
    return v_id;
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

-- data ------------------------------------------------------------------------------

-- settings row for the users who already use the app
insert into public.st_settings (user_id)
select distinct user_id from public.st_activities
on conflict (user_id) do nothing;

-- exercises used by a single plain activity only -> linked to it
update public.st_metrics m
set activity_id = u.activity_id
from (
  select v.metric_id, min(s.activity_id::text)::uuid as activity_id
  from public.st_session_values v
  join public.st_sessions s on s.id = v.session_id
  group by v.metric_id
  having count(distinct s.activity_id) = 1
) u
join public.st_activities a on a.id = u.activity_id
where m.id = u.metric_id
  and m.profile is null
  and m.activity_id is null
  and not a.intimate
  and a.icon not in ('directions_run', 'sprint', 'directions_bike', 'pool', 'hiking');

-- grants ------------------------------------------------------------------------------

revoke execute on function
  public.st_metrics_guard(),
  public.st_activities_unlink(),
  public.st_sessions_guard()
from public, anon, authenticated;

commit;
