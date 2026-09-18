revoke execute on function public.create_room(jsonb) from public, anon, authenticated;
grant execute on function public.create_room(jsonb) to service_role;
