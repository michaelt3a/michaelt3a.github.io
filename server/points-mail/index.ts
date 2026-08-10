// Supabase Edge Function: points-mail
//
// Runs on a daily schedule and sends two kinds of email through Resend:
//
//  1. Earn note   - the player earned points since the last note (at most one
//                   of these per day per player).
//  2. Reminder    - the player has enough for a code (400+) but hasn't played
//                   in a week. Sent at most every 14 days so it stays a nudge,
//                   not nagging.
//
// It also handles unsubscribe links: GET <function-url>?unsub=<token> flips
// the row to subscribed=false and shows a tiny confirmation page.
//
// Secrets it needs (Project Settings -> Edge Functions -> Secrets):
//   RESEND_API_KEY  - from resend.com
//   MAIL_FROM       - e.g. "Pokeworks Games <games@yourdomain.com>"
//                     (use "onboarding@resend.dev" while testing)
//   SITE_URL        - e.g. "https://michaelt3a.github.io"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "onboarding@resend.dev";
const SITE_URL = Deno.env.get("SITE_URL") ?? "";

const CHEAPEST_CODE = 400;
const REMIND_AFTER_DAYS = 7; // idle this long with a spendable balance
const REMIND_EVERY_DAYS = 14;

type Row = {
  id: number;
  email: string;
  name: string | null;
  balance: number;
  subscribed: boolean;
  unsub_token: string;
  last_earned_at: string | null;
  last_earn_mail_at: string | null;
  last_reminder_at: string | null;
};

function sbHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbGet(path: string): Promise<Row[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return res.json();
}

async function sbPatch(id: number, body: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/points_mail?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

function footer(row: Row, functionUrl: string): string {
  return (
    `<p style="color:#889;font-size:12px;margin-top:24px">` +
    `You signed up for these in the Pokeworks Rewards Shop. ` +
    `<a href="${functionUrl}?unsub=${row.unsub_token}">Unsubscribe</a></p>`
  );
}

async function send(row: Row, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: MAIL_FROM, to: [row.email], subject, html }),
  });
  return res.ok;
}

function hi(row: Row): string {
  return row.name ? `Hey ${row.name}` : "Hey";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Unsubscribe link from an email footer.
  const unsub = url.searchParams.get("unsub");
  if (unsub) {
    await fetch(`${SUPABASE_URL}/rest/v1/points_mail?unsub_token=eq.${unsub}`, {
      method: "PATCH",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ subscribed: false }),
    });
    return new Response(
      "<html><body style='font-family:sans-serif;text-align:center;padding:60px'>" +
        "<h2>You're unsubscribed.</h2><p>No more points email. Your points are still yours.</p>" +
        "</body></html>",
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const functionUrl = `${url.origin}${url.pathname}`;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rows = await sbGet("points_mail?select=*&subscribed=eq.true");

  let earnNotes = 0;
  let reminders = 0;

  for (const row of rows) {
    const earnedAt = row.last_earned_at ? Date.parse(row.last_earned_at) : 0;
    const earnMailAt = row.last_earn_mail_at ? Date.parse(row.last_earn_mail_at) : 0;
    const remindAt = row.last_reminder_at ? Date.parse(row.last_reminder_at) : 0;

    // 1. Earn note: they earned since the last note, and the last note wasn't
    //    within the past day.
    if (earnedAt && earnedAt > earnMailAt && now - earnMailAt > day) {
      const ok = await send(
        row,
        `You're at ${row.balance} Pokeworks points`,
        `<p>${hi(row)},</p>` +
          `<p>Nice playing. Your Rewards Shop balance is <strong>${row.balance} points</strong>.</p>` +
          (row.balance >= CHEAPEST_CODE
            ? `<p>That's enough for a discount code. <a href="${SITE_URL}/shop.html">Spend them here.</a></p>`
            : `<p>Codes start at ${CHEAPEST_CODE}. <a href="${SITE_URL}/index.html">Keep playing.</a></p>`) +
          footer(row, functionUrl),
      );
      if (ok) {
        await sbPatch(row.id, { last_earn_mail_at: new Date().toISOString() });
        earnNotes++;
      }
      continue; // one email per player per run
    }

    // 2. Reminder: spendable balance, idle a week, not nagged recently.
    const idle = earnedAt ? now - earnedAt > REMIND_AFTER_DAYS * day : false;
    const notNagged = now - remindAt > REMIND_EVERY_DAYS * day;
    if (row.balance >= CHEAPEST_CODE && idle && notNagged) {
      const ok = await send(
        row,
        `${row.balance} Pokeworks points are waiting on you`,
        `<p>${hi(row)},</p>` +
          `<p>You've got <strong>${row.balance} points</strong> sitting in the Rewards Shop, ` +
          `and that's already enough for a discount code.</p>` +
          `<p><a href="${SITE_URL}/shop.html">Cash some in</a> or ` +
          `<a href="${SITE_URL}/index.html">stack a few more</a>.</p>` +
          footer(row, functionUrl),
      );
      if (ok) {
        await sbPatch(row.id, { last_reminder_at: new Date().toISOString() });
        reminders++;
      }
    }
  }

  return new Response(JSON.stringify({ subscribers: rows.length, earnNotes, reminders }), {
    headers: { "Content-Type": "application/json" },
  });
});
