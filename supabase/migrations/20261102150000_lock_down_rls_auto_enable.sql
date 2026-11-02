-- rls_auto_enable() is created by the "Enable automatic RLS" project setting and runs
-- from an event trigger. It doesn't need to be callable through the public API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
