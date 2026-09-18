-- Idempotent reliability patch for databases installed from the quiz MVP migration.
-- Preserves rooms and answers while adding expired-question reconciliation and host counts.

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

revoke execute on function public.finalize_expired_question(text) from public;
grant execute on function public.finalize_expired_question(text) to anon, authenticated;
