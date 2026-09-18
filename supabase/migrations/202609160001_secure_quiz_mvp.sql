-- Secure, clean-project schema for the realtime quiz MVP.
-- Run this migration in a NEW Supabase project.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.game_status as enum ('lobby', 'running', 'paused', 'reveal', 'finished');

create or replace function public.valid_quiz_options(value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) between 4 and 10
    and not exists (
      select 1 from jsonb_array_elements(value) item
      where jsonb_typeof(item) <> 'string' or btrim(item #>> '{}') = ''
    );
$$;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_secret_hash bytea not null unique,
  status public.game_status not null default 'lobby',
  current_question_id uuid,
  question_started_at timestamptz,
  question_ends_at timestamptz,
  paused_remaining_ms integer check (paused_remaining_ms is null or paused_remaining_ms between 0 and 300000),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  position integer not null check (position >= 0),
  fact text not null check (btrim(fact) <> '' and char_length(fact) <= 2000),
  options jsonb not null check (public.valid_quiz_options(options)),
  correct_index integer not null check (correct_index >= 0),
  duration_seconds integer not null check (duration_seconds between 5 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, position),
  unique (room_id, id),
  check (correct_index < jsonb_array_length(options))
);

alter table public.rooms
  add constraint rooms_current_question_fk
  foreign key (id, current_question_id)
  references public.questions(room_id, id)
  deferrable initially deferred;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) between 2 and 80),
  participant_secret_hash bytea not null unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, id)
);

create table public.answers (
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null,
  participant_id uuid not null,
  option_index integer not null check (option_index >= 0),
  submitted_at timestamptz not null default clock_timestamp(),
  primary key (question_id, participant_id),
  foreign key (room_id, question_id) references public.questions(room_id, id) on delete cascade,
  foreign key (room_id, participant_id) references public.participants(room_id, id) on delete cascade
);

create table public.room_signals (
  room_code text primary key,
  state_version bigint not null,
  updated_at timestamptz not null default now()
);

create index questions_room_position_idx on public.questions(room_id, position);
create index participants_room_idx on public.participants(room_id);
create index answers_room_question_idx on public.answers(room_id, question_id);
create index rooms_expires_idx on public.rooms(expires_at);

alter table public.rooms enable row level security;
alter table public.questions enable row level security;
alter table public.participants enable row level security;
alter table public.answers enable row level security;
alter table public.room_signals enable row level security;
alter table public.rooms force row level security;
alter table public.questions force row level security;
alter table public.participants force row level security;
alter table public.answers force row level security;
alter table public.room_signals force row level security;

revoke all on public.rooms, public.questions, public.participants, public.answers, public.room_signals from public, anon, authenticated;
grant select on public.room_signals to anon, authenticated;
create policy room_signals_read on public.room_signals for select to anon, authenticated using (true);

create or replace function public.normalize_room_code(value text)
returns text language sql immutable set search_path = public, pg_temp
as $$ select upper(regexp_replace(coalesce(value, ''), '[^a-zA-Z0-9]', '', 'g')) $$;

create or replace function public.touch_room(target_room_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms;
begin
  update public.rooms
  set state_version = state_version + 1, updated_at = clock_timestamp()
  where id = target_room_id returning * into r;
  insert into public.room_signals(room_code, state_version, updated_at)
  values (r.code, r.state_version, clock_timestamp())
  on conflict (room_code) do update set state_version = excluded.state_version, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.room_for_host(secret text)
returns public.rooms language sql security definer set search_path = public, pg_temp
as $$
  select r.* from public.rooms r
  where r.host_secret_hash = extensions.digest(coalesce(secret, ''), 'sha256') and r.expires_at > clock_timestamp()
  limit 1
$$;

create or replace function public.participant_for_secret(room uuid, secret text)
returns public.participants language sql security definer set search_path = public, pg_temp
as $$
  select p.* from public.participants p
  where p.room_id = room and p.participant_secret_hash = extensions.digest(coalesce(secret, ''), 'sha256')
  limit 1
$$;

create or replace function public.validate_questions_payload(payload jsonb)
returns void language plpgsql set search_path = public, pg_temp
as $$
declare item jsonb; count_items integer := 0; options_value jsonb; correct_value integer; duration_value integer;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) < 1 or jsonb_array_length(payload) > 100 then
    raise exception 'invalid_questions';
  end if;
  for item in select * from jsonb_array_elements(payload) loop
    count_items := count_items + 1;
    options_value := item->'options';
    correct_value := (item->>'correct_index')::integer;
    duration_value := (item->>'duration_seconds')::integer;
    if btrim(coalesce(item->>'fact','')) = '' or char_length(item->>'fact') > 2000
      or not public.valid_quiz_options(options_value)
      or correct_value < 0 or correct_value >= jsonb_array_length(options_value)
      or duration_value not between 5 and 300 then
      raise exception 'invalid_question_at_%', count_items;
    end if;
  end loop;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_questions';
end;
$$;

create or replace function public.insert_questions(target_room uuid, payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare item jsonb; idx integer := 0;
begin
  perform public.validate_questions_payload(payload);
  for item in select * from jsonb_array_elements(payload) loop
    insert into public.questions(id, room_id, position, fact, options, correct_index, duration_seconds)
    values (gen_random_uuid(), target_room, idx, btrim(item->>'fact'), item->'options', (item->>'correct_index')::integer, (item->>'duration_seconds')::integer);
    idx := idx + 1;
  end loop;
end;
$$;

create or replace function public.create_room(p_questions jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare raw_secret text := encode(extensions.gen_random_bytes(32),'hex'); new_code text; new_room public.rooms; attempts integer := 0;
begin
  perform public.validate_questions_payload(p_questions);
  loop
    attempts := attempts + 1;
    new_code := upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
    begin
      insert into public.rooms(code, host_secret_hash) values (new_code, extensions.digest(raw_secret,'sha256')) returning * into new_room;
      exit;
    exception when unique_violation then
      if attempts >= 10 then raise exception 'room_code_generation_failed'; end if;
    end;
  end loop;
  perform public.insert_questions(new_room.id, p_questions);
  perform public.touch_room(new_room.id);
  return jsonb_build_object('code',new_room.code,'host_secret',raw_secret,'expires_at',new_room.expires_at);
end;
$$;

create or replace function public.host_snapshot_json(r public.rooms)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$
select jsonb_build_object(
  'server_time', clock_timestamp(),
  'room', jsonb_build_object('id',r.id,'code',r.code,'status',r.status,'current_question_id',r.current_question_id,'question_started_at',r.question_started_at,'question_ends_at',r.question_ends_at,'paused_remaining_ms',r.paused_remaining_ms,'state_version',r.state_version,'expires_at',r.expires_at),
  'questions', coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'fact',q.fact,'options',q.options,'correct_index',q.correct_index,'duration_seconds',q.duration_seconds,'position',q.position) order by q.position) from public.questions q where q.room_id=r.id),'[]'::jsonb),
  'participants', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.joined_at) from public.participants p where p.room_id=r.id),'[]'::jsonb),
  'answered_count', (select count(*) from public.answers a where a.room_id=r.id and a.question_id=r.current_question_id),
  'answers', case when r.status in ('reveal','finished') then coalesce((select jsonb_agg(jsonb_build_object('participant_id',a.participant_id,'name',p.name,'question_id',a.question_id,'option_index',a.option_index)) from public.answers a join public.participants p on p.id=a.participant_id where a.room_id=r.id and a.question_id=r.current_question_id),'[]'::jsonb) else '[]'::jsonb end
)
$$;

create or replace function public.reconcile_expired(target_room uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare changed boolean;
begin
  update public.rooms set status='reveal', question_ends_at=null, updated_at=clock_timestamp()
  where id=target_room and status='running' and question_ends_at <= clock_timestamp()
  returning true into changed;
  if changed then perform public.touch_room(target_room); end if;
end;
$$;

create or replace function public.finalize_expired_question(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; previous_version bigint;
begin
  select * into r from public.rooms where code=public.normalize_room_code(p_code) and expires_at > clock_timestamp();
  if r.id is null then raise exception 'room_not_found'; end if;
  previous_version := r.state_version;
  perform public.reconcile_expired(r.id);
  select * into r from public.rooms where id=r.id;
  return jsonb_build_object('finalized', r.state_version > previous_version, 'state_version', r.state_version);
end;
$$;

create or replace function public.get_host_snapshot(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms;
begin
  r := public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if;
  perform public.reconcile_expired(r.id); select * into r from public.rooms where id=r.id;
  return public.host_snapshot_json(r);
end;
$$;

create or replace function public.save_questions(p_host_secret text, p_questions jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms;
begin
  r := public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if;
  perform 1 from public.rooms where id=r.id for update;
  if r.status <> 'lobby' or r.current_question_id is not null then raise exception 'game_already_started'; end if;
  delete from public.questions where room_id=r.id; perform public.insert_questions(r.id,p_questions); perform public.touch_room(r.id);
  select * into r from public.rooms where id=r.id; return public.host_snapshot_json(r);
end;
$$;

create or replace function public.join_room(p_code text, p_name text, p_participant_secret text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; p public.participants; raw_secret text;
begin
  select * into r from public.rooms where code=public.normalize_room_code(p_code) and expires_at>clock_timestamp();
  if r.id is null then raise exception 'room_not_found'; end if;
  if btrim(coalesce(p_name,''))='' or char_length(btrim(p_name)) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if p_participant_secret is not null then p := public.participant_for_secret(r.id,p_participant_secret); end if;
  if p.id is null then
    raw_secret := encode(extensions.gen_random_bytes(32),'hex');
    insert into public.participants(room_id,name,participant_secret_hash) values(r.id,btrim(p_name),extensions.digest(raw_secret,'sha256')) returning * into p;
    perform public.touch_room(r.id);
  else
    raw_secret := p_participant_secret;
    update public.participants set name=btrim(p_name),last_seen_at=clock_timestamp() where id=p.id returning * into p;
  end if;
  return jsonb_build_object('code',r.code,'participant_id',p.id,'participant_secret',raw_secret);
end;
$$;

create or replace function public.get_player_snapshot(p_code text, p_participant_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; p public.participants; q public.questions; own_answer public.answers; result_answers jsonb := '[]'::jsonb;
begin
  select * into r from public.rooms where code=public.normalize_room_code(p_code) and expires_at>clock_timestamp(); if r.id is null then raise exception 'room_not_found'; end if;
  p := public.participant_for_secret(r.id,p_participant_secret); if p.id is null then raise exception 'invalid_participant_secret'; end if;
  perform public.reconcile_expired(r.id); select * into r from public.rooms where id=r.id;
  if r.current_question_id is not null then select * into q from public.questions where id=r.current_question_id; select * into own_answer from public.answers where question_id=q.id and participant_id=p.id; end if;
  if r.status in ('reveal','finished') and q.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('participant_id',a.participant_id,'name',pp.name,'option_index',a.option_index)),'[]'::jsonb) into result_answers from public.answers a join public.participants pp on pp.id=a.participant_id where a.room_id=r.id and a.question_id=q.id;
  end if;
  return jsonb_build_object('server_time',clock_timestamp(),'room',jsonb_build_object('code',r.code,'status',r.status,'state_version',r.state_version,'question_started_at',r.question_started_at,'question_ends_at',r.question_ends_at,'paused_remaining_ms',r.paused_remaining_ms),'participant',jsonb_build_object('id',p.id,'name',p.name),'question',case when q.id is null then null else jsonb_strip_nulls(jsonb_build_object('id',q.id,'fact',q.fact,'options',q.options,'duration_seconds',q.duration_seconds,'position',q.position,'correct_index',case when r.status in ('reveal','finished') then q.correct_index else null end)) end,'own_answer',case when own_answer.question_id is null then null else jsonb_build_object('option_index',own_answer.option_index) end,'answers',result_answers);
end;
$$;

create or replace function public.submit_answer(p_code text,p_participant_secret text,p_question_id uuid,p_option_index integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; p public.participants; q public.questions;
begin
  select * into r from public.rooms where code=public.normalize_room_code(p_code) for update; if r.id is null then raise exception 'room_not_found'; end if;
  p := public.participant_for_secret(r.id,p_participant_secret); if p.id is null then raise exception 'invalid_participant_secret'; end if;
  if r.status<>'running' or r.current_question_id<>p_question_id or r.question_ends_at is null or clock_timestamp()>=r.question_ends_at then raise exception 'question_not_accepting_answers'; end if;
  select * into q from public.questions where id=p_question_id and room_id=r.id; if q.id is null or p_option_index<0 or p_option_index>=jsonb_array_length(q.options) then raise exception 'invalid_option'; end if;
  insert into public.answers(room_id,question_id,participant_id,option_index) values(r.id,q.id,p.id,p_option_index);
  perform public.touch_room(r.id); return jsonb_build_object('accepted',true,'option_index',p_option_index);
exception when unique_violation then raise exception 'answer_already_submitted';
end;
$$;

create or replace function public.start_question(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; q public.questions;
begin
  r:=public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if; perform 1 from public.rooms where id=r.id for update;
  if r.status<>'lobby' then raise exception 'invalid_transition'; end if;
  if r.current_question_id is null then select * into q from public.questions where room_id=r.id order by position limit 1; else select * into q from public.questions where id=r.current_question_id; end if;
  if q.id is null then raise exception 'no_questions'; end if;
  update public.rooms set current_question_id=q.id,status='running',question_started_at=clock_timestamp(),question_ends_at=clock_timestamp()+make_interval(secs=>q.duration_seconds),paused_remaining_ms=null where id=r.id;
  perform public.touch_room(r.id); return public.get_host_snapshot(p_host_secret);
end;
$$;

create or replace function public.pause_question(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; remaining integer;
begin
  r:=public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if; perform 1 from public.rooms where id=r.id for update;
  if r.status<>'running' then raise exception 'invalid_transition'; end if;
  remaining:=greatest(0,extract(epoch from (r.question_ends_at-clock_timestamp()))*1000)::integer;
  update public.rooms set status='paused',paused_remaining_ms=remaining,question_ends_at=null where id=r.id; perform public.touch_room(r.id); return public.get_host_snapshot(p_host_secret);
end;
$$;

create or replace function public.resume_question(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms;
begin
  r:=public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if; perform 1 from public.rooms where id=r.id for update;
  if r.status<>'paused' or r.paused_remaining_ms is null then raise exception 'invalid_transition'; end if;
  update public.rooms set status='running',question_started_at=clock_timestamp(),question_ends_at=clock_timestamp()+(r.paused_remaining_ms*interval '1 millisecond'),paused_remaining_ms=null where id=r.id; perform public.touch_room(r.id); return public.get_host_snapshot(p_host_secret);
end;
$$;

create or replace function public.reveal_question(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms;
begin
  r:=public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if; perform 1 from public.rooms where id=r.id for update;
  if r.status not in ('running','paused') then raise exception 'invalid_transition'; end if;
  update public.rooms set status='reveal',question_ends_at=null,paused_remaining_ms=null where id=r.id; perform public.touch_room(r.id); return public.get_host_snapshot(p_host_secret);
end;
$$;

create or replace function public.advance_question(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; current_position integer; q public.questions;
begin
  r:=public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if; perform 1 from public.rooms where id=r.id for update;
  if r.status<>'reveal' then raise exception 'invalid_transition'; end if;
  select position into current_position from public.questions where id=r.current_question_id;
  select * into q from public.questions where room_id=r.id and position>current_position order by position limit 1;
  if q.id is null then update public.rooms set status='finished',question_started_at=null,question_ends_at=null,paused_remaining_ms=null where id=r.id;
  else update public.rooms set status='lobby',current_question_id=q.id,question_started_at=null,question_ends_at=null,paused_remaining_ms=null where id=r.id; end if;
  perform public.touch_room(r.id); return public.get_host_snapshot(p_host_secret);
end;
$$;

create or replace function public.finish_game(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms;
begin r:=public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if; update public.rooms set status='finished',question_ends_at=null,paused_remaining_ms=null where id=r.id; perform public.touch_room(r.id); return public.get_host_snapshot(p_host_secret); end;
$$;

create or replace function public.reset_game(p_host_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms;
begin r:=public.room_for_host(p_host_secret); if r.id is null then raise exception 'invalid_host_secret'; end if; delete from public.answers where room_id=r.id; update public.rooms set status='lobby',current_question_id=null,question_started_at=null,question_ends_at=null,paused_remaining_ms=null where id=r.id; perform public.touch_room(r.id); return public.get_host_snapshot(p_host_secret); end;
$$;

revoke execute on all functions in schema public from public;
grant execute on function public.create_room(jsonb) to anon, authenticated;
grant execute on function public.get_host_snapshot(text) to anon, authenticated;
grant execute on function public.finalize_expired_question(text) to anon, authenticated;
grant execute on function public.save_questions(text,jsonb) to anon, authenticated;
grant execute on function public.join_room(text,text,text) to anon, authenticated;
grant execute on function public.get_player_snapshot(text,text) to anon, authenticated;
grant execute on function public.submit_answer(text,text,uuid,integer) to anon, authenticated;
grant execute on function public.start_question(text) to anon, authenticated;
grant execute on function public.pause_question(text) to anon, authenticated;
grant execute on function public.resume_question(text) to anon, authenticated;
grant execute on function public.reveal_question(text) to anon, authenticated;
grant execute on function public.advance_question(text) to anon, authenticated;
grant execute on function public.finish_game(text) to anon, authenticated;
grant execute on function public.reset_game(text) to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_signals') then
    alter publication supabase_realtime add table public.room_signals;
  end if;
end $$;
