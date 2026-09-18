-- Idempotent cumulative statistics patch for the installed quiz database.
create or replace function public.participant_stats_json(target_room uuid)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'participant_id', p.id,
    'name', p.name,
    'correct_count', coalesce(a.correct_count,0),
    'answered_count', coalesce(a.answered_count,0),
    'total_questions', (select count(*) from public.questions q0 where q0.room_id=target_room)
  ) order by coalesce(a.correct_count,0) desc, coalesce(a.answered_count,0) desc, p.joined_at, p.id),'[]'::jsonb)
  from public.participants p
  left join (
    select a.participant_id,
      count(*)::integer as answered_count,
      count(*) filter (where a.option_index=q.correct_index)::integer as correct_count
    from public.answers a join public.questions q on q.id=a.question_id and q.room_id=a.room_id
    where a.room_id=target_room group by a.participant_id
  ) a on a.participant_id=p.id
  where p.room_id=target_room
$$;

create or replace function public.host_snapshot_json(r public.rooms)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$
select jsonb_build_object(
  'server_time', clock_timestamp(),
  'room', jsonb_build_object('id',r.id,'code',r.code,'status',r.status,'current_question_id',r.current_question_id,'question_started_at',r.question_started_at,'question_ends_at',r.question_ends_at,'paused_remaining_ms',r.paused_remaining_ms,'state_version',r.state_version,'expires_at',r.expires_at),
  'questions', coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'fact',q.fact,'options',q.options,'correct_index',q.correct_index,'duration_seconds',q.duration_seconds,'position',q.position) order by q.position) from public.questions q where q.room_id=r.id),'[]'::jsonb),
  'participants', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.joined_at,p.id) from public.participants p where p.room_id=r.id),'[]'::jsonb),
  'answered_count', (select count(*) from public.answers a where a.room_id=r.id and a.question_id=r.current_question_id),
  'answers', case when r.status in ('reveal','finished') then coalesce((select jsonb_agg(jsonb_build_object('participant_id',a.participant_id,'name',p.name,'question_id',a.question_id,'option_index',a.option_index)) from public.answers a join public.participants p on p.id=a.participant_id where a.room_id=r.id and a.question_id=r.current_question_id),'[]'::jsonb) else '[]'::jsonb end,
  'participant_stats', case when r.status in ('reveal','finished') then public.participant_stats_json(r.id) else '[]'::jsonb end
)
$$;

create or replace function public.get_player_snapshot(p_code text, p_participant_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.rooms; p public.participants; q public.questions; own_answer public.answers; result_answers jsonb := '[]'::jsonb; result_stats jsonb := '[]'::jsonb;
begin
  select * into r from public.rooms where code=public.normalize_room_code(p_code) and expires_at>clock_timestamp(); if r.id is null then raise exception 'room_not_found'; end if;
  p := public.participant_for_secret(r.id,p_participant_secret); if p.id is null then raise exception 'invalid_participant_secret'; end if;
  perform public.reconcile_expired(r.id); select * into r from public.rooms where id=r.id;
  if r.current_question_id is not null then select * into q from public.questions where id=r.current_question_id; select * into own_answer from public.answers where question_id=q.id and participant_id=p.id; end if;
  if r.status in ('reveal','finished') and q.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('participant_id',a.participant_id,'name',pp.name,'option_index',a.option_index)),'[]'::jsonb) into result_answers from public.answers a join public.participants pp on pp.id=a.participant_id where a.room_id=r.id and a.question_id=q.id;
    result_stats := public.participant_stats_json(r.id);
  end if;
  return jsonb_build_object('server_time',clock_timestamp(),'room',jsonb_build_object('code',r.code,'status',r.status,'state_version',r.state_version,'current_question_id',r.current_question_id,'question_started_at',r.question_started_at,'question_ends_at',r.question_ends_at,'paused_remaining_ms',r.paused_remaining_ms),'participant',jsonb_build_object('id',p.id,'name',p.name),'question',case when q.id is null then null else jsonb_strip_nulls(jsonb_build_object('id',q.id,'fact',q.fact,'options',q.options,'duration_seconds',q.duration_seconds,'position',q.position,'correct_index',case when r.status in ('reveal','finished') then q.correct_index else null end)) end,'own_answer',case when own_answer.question_id is null then null else jsonb_build_object('option_index',own_answer.option_index) end,'answers',result_answers,'participant_stats',result_stats);
end;
$$;
