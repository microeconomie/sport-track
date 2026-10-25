-- sport-track v2: measures tied to the activity icon (profiles), exercises always sets × kg × reps.
--  * st_metrics.profile: run | bike | swim | hike for the built-in measures, null for exercises
--  * one built-in measure per (user, profile, type): run (distance, duration, pace, speed),
--    bike (duration, distance, speed), swim (duration, number = laps), hike (duration, distance, number = m D+)
--  * built-in measures can be neither modified nor deleted by the app (RLS); they still go away
--    with the user account, since referential cascades bypass RLS
--  * the former run metrics (distance, duration, pace, speed without profile) become the run
--    built-ins in place: same ids, so every value already declared is kept
-- Applied once in a transaction with `npx supabase db query --linked -f`, like 001.


-- profile column and its rules --------------------------------------------

alter table public.st_metrics
  add column profile text check (profile in ('run', 'bike', 'swim', 'hike'));

-- existing run metrics -> run built-ins (first one of each type per user, if several)
with ranked as (
  select id, type,
         row_number() over (partition by user_id, type order by position, created_at) as rn
  from public.st_metrics
  where profile is null and type in ('distance', 'duration', 'pace', 'speed')
)
update public.st_metrics m
set profile = 'run',
    name = case r.type when 'distance' then 'Distance' when 'duration' then 'Durée'
                       when 'pace' then 'Allure' else 'Vitesse moyenne' end,
    unit = null
from ranked r
where m.id = r.id and r.rn = 1;

-- exercises are sets only; built-ins only use the types of their profile
alter table public.st_metrics
  add constraint st_metrics_exercise_is_sets check (profile is not null or type = 'sets'),
  add constraint st_metrics_profile_types check (
    profile is null
    or (profile = 'run' and type in ('distance', 'duration', 'pace', 'speed'))
    or (profile = 'bike' and type in ('distance', 'duration', 'speed'))
    or (profile = 'swim' and type in ('duration', 'number'))
    or (profile = 'hike' and type in ('distance', 'duration', 'number'))
  );

create unique index st_metrics_one_builtin_idx
  on public.st_metrics (user_id, profile, type) where profile is not null;

-- built-ins: readable and creatable (the unique index prevents duplicates), never changed or deleted
drop policy "st_metrics_update_own" on public.st_metrics;
drop policy "st_metrics_delete_own" on public.st_metrics;

create policy "st_metrics_update_own" on public.st_metrics
  for update to authenticated
  using (auth.uid() = user_id and profile is null)
  with check (auth.uid() = user_id and profile is null and type = 'sets');
create policy "st_metrics_delete_own" on public.st_metrics
  for delete to authenticated using (auth.uid() = user_id and profile is null);

-- defaults -----------------------------------------------------------------

-- Creates the missing built-in measures on every call, and the starting activities and
-- exercise when the user has no activity yet. Idempotent and safe to call concurrently.
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
    insert into public.st_metrics (user_id, name, type, position)
    values (auth.uid(), 'Exercice biceps', 'sets', 100);
  end if;
end;
$$;

-- built-ins for the users who already use the app (the app also calls st_ensure_defaults at start)
insert into public.st_metrics (user_id, profile, name, type, unit, position)
select u.user_id, b.profile, b.name, b.type, b.unit, b.position
from (select distinct user_id from public.st_activities) as u
cross join (values
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
