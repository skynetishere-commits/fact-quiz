-- Use ONLY for a new quiz project after a failed partial installation.
-- This removes quiz objects created by the migration. It deletes quiz data.

drop table if exists public.answers cascade;
drop table if exists public.participants cascade;
drop table if exists public.room_signals cascade;
drop table if exists public.questions cascade;
drop table if exists public.rooms cascade;
drop type if exists public.game_status cascade;

drop function if exists public.valid_quiz_options(jsonb) cascade;
drop function if exists public.normalize_room_code(text) cascade;
drop function if exists public.touch_room(uuid) cascade;
drop function if exists public.room_for_host(text) cascade;
drop function if exists public.participant_for_secret(uuid, text) cascade;
drop function if exists public.validate_questions_payload(jsonb) cascade;
drop function if exists public.insert_questions(uuid, jsonb) cascade;
drop function if exists public.create_room(jsonb) cascade;
drop function if exists public.reconcile_expired(uuid) cascade;
drop function if exists public.get_host_snapshot(text) cascade;
drop function if exists public.save_questions(text, jsonb) cascade;
drop function if exists public.join_room(text, text, text) cascade;
drop function if exists public.get_player_snapshot(text, text) cascade;
drop function if exists public.submit_answer(text, text, uuid, integer) cascade;
drop function if exists public.start_question(text) cascade;
drop function if exists public.pause_question(text) cascade;
drop function if exists public.resume_question(text) cascade;
drop function if exists public.reveal_question(text) cascade;
drop function if exists public.advance_question(text) cascade;
drop function if exists public.finish_game(text) cascade;
drop function if exists public.reset_game(text) cascade;
