# Sign-in setup (GitHub + Google)

Meld signs people in with Supabase Auth. The code is ready; these three steps connect the
providers. They need your accounts, so they can't be done from the repo. ~10 minutes.

The callback URL used below (same for both providers):

```
https://twukmsemlxvnchjzaoqf.supabase.co/auth/v1/callback
```

## 1. GitHub

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
2. Application name: `Meld` · Homepage URL: `https://meld-fawn.vercel.app`
   · Authorization callback URL: the callback URL above.
3. **Register application**, then **Generate a new client secret**.
4. Supabase dashboard → **Authentication → Sign In / Providers → GitHub** → enable, paste the
   Client ID and Client Secret → **Save**.

## 2. Google

1. https://console.cloud.google.com → create or pick a project.
2. **APIs & Services → OAuth consent screen**: External, app name `Meld`, your support email.
   Add yourself (and teammates) as test users while the app is in "Testing".
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Web application.
   - Authorized JavaScript origins: `https://meld-fawn.vercel.app`
   - Authorized redirect URIs: the callback URL above.
4. Supabase → **Authentication → Sign In / Providers → Google** → enable, paste the Client ID and
   Client Secret → **Save**.

## 3. Where Supabase may send people back

Supabase → **Authentication → URL Configuration**:

- Site URL: `https://meld-fawn.vercel.app`
- Redirect URLs (add all three):
  - `https://meld-fawn.vercel.app/**`
  - `https://*-jaynouolivers-projects.vercel.app/**` (branch previews)
  - `http://localhost:3000/**`

No new environment variables are needed: the app already has `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The Mac app needs nothing extra: it signs in through `/auth/desktop` on the site, which is
already covered by the first redirect URL (see `apps/macos/README.md`).
