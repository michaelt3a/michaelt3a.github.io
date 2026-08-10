# Points email setup

The site already collects opt-ins and keeps balances synced (that part shipped
with the shop). What's left needs the Supabase dashboard and takes about ten
minutes. Nothing here runs on the website itself; this folder is just the
server-side pieces and instructions.

Two emails get sent, both deliberately low-volume:

- **Earn note.** The morning after a day where the player earned points:
  "You're at 455 points." At most one per day per player.
- **Reminder.** The player has 400+ points (enough for a code) but hasn't
  played in a week: "455 points are waiting on you." At most every 14 days.

Every email has an unsubscribe link that works with one click.

## 1. Create the table

Supabase dashboard -> SQL Editor -> paste and run `points-mail.sql`.

The RLS setup means the browser's anon key can sign people up and update
balances but can never read the email list back out.

## 2. Get a mail provider key

Sign up at [resend.com](https://resend.com) (free tier is 100 emails/day,
plenty). Grab an API key. While testing you can send from
`onboarding@resend.dev`; to send from a pokeworks address you'd verify the
domain in Resend, which marketing/IT would need to help with.

## 3. Deploy the function

With the [Supabase CLI](https://supabase.com/docs/guides/functions) logged in
to the project:

```bash
supabase functions deploy points-mail --no-verify-jwt
```

(`--no-verify-jwt` is needed so unsubscribe links work from email clients.)

Then set the secrets (dashboard -> Project Settings -> Edge Functions, or CLI):

```bash
supabase secrets set RESEND_API_KEY=re_xxxx MAIL_FROM="Pokeworks Games <onboarding@resend.dev>" SITE_URL=https://michaelt3a.github.io
```

## 4. Schedule it daily

Dashboard -> Integrations -> Cron (pg_cron) -> new job, or run this in the
SQL editor (fill in the project ref and anon key):

```sql
select cron.schedule(
  'points-mail-daily',
  '0 16 * * *',  -- 16:00 UTC = 9am Pacific
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/points-mail',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )
  $$
);
```

## 5. Test it

Sign up in the shop with your own email, earn a few points, then hit the
function URL in a browser (or wait for the cron). The JSON response shows how
many of each email went out. Check the unsubscribe link in the email you get.
