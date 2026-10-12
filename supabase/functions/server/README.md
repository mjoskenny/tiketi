# QPassa payment Edge Function

This function is deployed as `server` for Supabase project `nunysxvsgoxyxywjtbku`. Its entrypoint is `index.ts`; the payment adapter lives in `payments.ts`.

## Configure iHela sandbox

The function reads these values only from Supabase Edge Function secrets:

- `PAYMENT_PROVIDER` — `ihela`
- `MOBILE_MONEY_PAYMENT_PROVIDER` — optional; set this to the existing provider (for example `dpo_pay`) to keep the separate Mobile Money option active alongside iHela. If omitted, existing deployments continue using `PAYMENT_PROVIDER` for Mobile Money unless that value is `ihela`.
- `IHELA_API_URL` — `https://api.ihela.bi/testenv`
- `IHELA_CLIENT_ID` — iHela sandbox client ID
- `IHELA_CLIENT_SECRET` — iHela sandbox client secret
- `IHELA_MERCHANT_PIN` — iHela sandbox merchant PIN
- `APP_BASE_URL` — QPassa site origin, for example `https://qpassa.com` (or `http://localhost:8443` for local development)
- `IHELA_REDIRECT_URI` — optional; the exact HTTPS return URL registered with iHela. If omitted, the function returns to `/my-tickets?order_id=...` on `APP_BASE_URL`.

Set secrets in Supabase Dashboard → Edge Functions → Secrets, or create a local, git-ignored `supabase/functions/.env.ihela` file containing those `KEY=value` entries and use it with the CLI. Do not commit the credentials, place them in Vite variables, or send them in chat.

## Deploy

Install the Supabase CLI and authenticate in a local terminal, then run from the repository root:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref nunysxvsgoxyxywjtbku
npx.cmd supabase secrets set --env-file supabase/functions/.env.ihela
npx.cmd supabase functions deploy server --project-ref nunysxvsgoxyxywjtbku
```

The existing `supabase/config.toml` keeps JWT verification disabled for this function because the payment callback route has no user JWT; authenticated checkout and status routes validate the caller's bearer token themselves. iHela callback processing remains disabled until iHela confirms its callback payload/signature. Payment confirmation currently uses authenticated `bill-check` polling.

After deployment, check `https://nunysxvsgoxyxywjtbku.supabase.co/functions/v1/server/make-server-4880c4b3/payments/health`. It should return `configured: true` and `provider: "ihela"`. A 503 with `provider: "unconfigured"` means `PAYMENT_PROVIDER` has not been set on the deployed function; a 503 with `provider: "ihela"` reports missing iHela secrets.
