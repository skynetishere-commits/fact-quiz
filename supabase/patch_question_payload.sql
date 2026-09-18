-- Apply this patch after the initial migration if it was installed before
-- the snake_case question payload fix. It keeps existing rooms and data.

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
