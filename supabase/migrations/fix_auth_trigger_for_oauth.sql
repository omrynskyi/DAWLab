-- Modify the trigger function to only create a public.users record
-- if a username is explicitly provided in the auth metadata.
-- This ensures that OAuth users (who don't have a username yet)
-- are not automatically assigned their email as a username,
-- allowing the frontend to detect the missing user and show the username setup screen.

CREATE OR REPLACE FUNCTION public.handle_auth_user_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  _username text;
begin
  -- Check if username is in metadata
  _username := new.raw_user_meta_data->>'username';

  -- If no username provided (e.g. OAuth flow), skip creation.
  -- The application will handle user creation after username selection.
  if _username is null or _username = '' then
    return new;
  end if;

  -- If a user with this id already exists, do nothing
  if exists (select 1 from public.users where id = new.id) then
    return new;
  end if;

  -- Insert the user into public.users
  insert into public.users (id, username)
  values (new.id, _username);

  return new;
end;
$function$;
