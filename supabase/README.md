# Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → URL configuration**: add your site URL (e.g. `http://localhost:3000`) and redirect URL `http://localhost:3000/auth/callback`.
3. Open **SQL Editor**, paste the contents of `migrations/20260209120000_profiles.sql`, and run it.
4. In the frontend, copy `frontend/.env.local.example` to `frontend/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from **Project Settings → API**.

**Redirect URLs:** Under **Authentication → URL configuration**, add exactly  
`http://localhost:3000/auth/callback` (plus your production URL when you deploy).  
Email confirmation uses PKCE: **open the confirmation link in the same browser** where you started sign-up (opening only from a phone mail app often fails because that browser never held the PKCE cookie).

Email signup uses Supabase’s built-in auth. Disable “Confirm email” under **Authentication → Providers → Email** for faster local testing if you want immediate sessions after sign-up.
