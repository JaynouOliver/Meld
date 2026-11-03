// Records every Meld feature as its own clip from the live one-click demo.
//   npm i -D playwright && npx playwright install chromium   (once)
//   node video/capture.mjs                     # all scenes -> video/out/
//   node video/capture.mjs missions-checkin    # one scene (reuses video/out/session.json)
// BASE_URL=http://localhost:3000 to record a local server instead.
//
// Each scene runs in a fresh browser context with video recording on, a visible cursor
// with click ripples, and human-speed typing. Scenes that wait on agents allow up to
// 90 s; trim the waiting in the edit. video/out/scenes.json lists each clip with
// timestamped "marks" (seconds from clip start) for captions and cuts.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "https://meld-fawn.vercel.app";
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "out");
const SESSION = path.join(OUT, "session.json");
const SIZE = { width: 1600, height: 1000 };
fs.mkdirSync(OUT, { recursive: true });

// A cursor the recording can see (Playwright's video has none).
const CURSOR = () => {
  const add = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;left:-40px;top:-40px;transition:transform .08s;";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 10-6.5 1.5L16 21l-3 1.2-3.3-7.4L4 19z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX - 3 + "px"; c.style.top = e.clientY - 2 + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:2px solid #2952e3;opacity:.8;transition:all .45s ease-out;`;
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
};

function helpers(page, marks, t0) {
  const h = { sleep: (ms) => page.waitForTimeout(ms) };
  const sleep = (ms) => page.waitForTimeout(ms);
  const mark = (label) => marks.push({ t: +((Date.now() - t0) / 1000).toFixed(2), label });
  const point = async (loc) => {
    await loc.waitFor({ state: "visible", timeout: 30000 });
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 });
    await sleep(250);
  };
  const click = async (loc) => { await point(loc); await loc.click(); await sleep(500); };
  const type = async (loc, text) => { await click(loc); await loc.pressSequentially(text, { delay: 38 }); await sleep(400); };
  const send = async (loc, text) => { await type(loc, text); await page.keyboard.press("Enter"); };
  const channel = (name) => page.getByRole("link", { name: new RegExp(`^${name}( \\d+)?$`) }).first();
  const composer = () => page.locator("#main-input").locator("visible=true").first();
  const threadBox = () => page.getByPlaceholder(/^Reply/);
  /** Wait for agents to start and finish (live bubbles), confirming any proposed changes. */
  const agentsDone = async (max = 90000) => {
    const live = page.locator('[data-testid="atlas-live"]');
    const confirm = page.getByRole("button", { name: "Confirm" }).locator("visible=true");
    let confirmed = 0;
    await live.first().waitFor({ timeout: 15000 }).catch(() => {});
    const end = Date.now() + max;
    let quiet = 0;
    // Done once nothing is running and no proposal is waiting, for ~3 s in a row
    // (a proposal card can land just after the live bubble ends).
    while (Date.now() < end && quiet < 4) {
      if (confirmed < 2 && (await confirm.count())) { await h.sleep(1800); await click(confirm.last()); confirmed++; quiet = 0; continue; }
      quiet = (await live.count()) ? 0 : quiet + 1;
      await sleep(800);
    }
    await sleep(1500);
  };
  return { sleep, mark, point, click, type, send, channel, composer, threadBox, agentsDone };
}

// ---- Scenes (in story order) ----------------------------------------------------------
const SCENES = {
  // Landing page -> one click -> a live workspace with people, agents and work in flight.
  async "01-landing"(page, h) {
    await page.goto(BASE + "/");
    h.mark("landing");
    await h.sleep(2500);
    await h.point(page.getByText("Missions", { exact: true }).first());
    await h.sleep(1200);
    h.mark("click try demo");
    await h.click(page.getByRole("button", { name: /Try the live demo/ }));
    await page.waitForURL(/\/chat\//, { timeout: 60000 });
    h.mark("workspace ready");
    await h.sleep(3000);
  },

  // Chat like Slack; ask Atlas a question about the work and watch it answer live.
  async "02-chat-ask-atlas"(page, h) {
    await page.goto(BASE + "/app");
    await page.waitForURL(/\/chat\//);
    await h.click(h.channel("engineering"));
    h.mark("#engineering");
    await h.sleep(1500);
    await h.send(h.composer(), "@atlas what's blocking the paid plans launch, and who owns it?");
    h.mark("asked Atlas");
    await h.agentsDone();
    h.mark("Atlas answered");
    await h.sleep(2000);
  },

  // A planning thread becomes owned tickets for everyone in it.
  async "03-thread-to-tickets"(page, h) {
    await page.goto(BASE + "/app");
    await page.waitForURL(/\/chat\//);
    await h.click(h.channel("product"));
    await h.click(page.getByRole("button", { name: /\d+ replies/ }).first());
    h.mark("thread open");
    await h.sleep(2500);
    await h.send(h.threadBox(), "@atlas turn this thread into tickets and assign everyone");
    h.mark("asked for tickets");
    await h.agentsDone();
    h.mark("tickets filed");
    await h.sleep(2500);
  },

  // A lurking agent notices a bug report, reacts 👀 and files it without being asked.
  async "04-triage-agent"(page, h) {
    await page.goto(BASE + "/app");
    await page.waitForURL(/\/chat\//);
    await h.click(h.channel("engineering"));
    await h.send(h.composer(), "Checkout is broken on Safari: the Pay button does nothing after the card form loads");
    h.mark("bug reported (nobody tagged)");
    await h.agentsDone();
    await h.click(page.getByRole("button", { name: /1 repl/ }).last());
    h.mark("Triage filed it (in the thread)");
    await h.sleep(4000);
  },

  // Agents hand work to each other: a standup summary from @standup.
  async "05-standup-agent"(page, h) {
    await page.goto(BASE + "/app");
    await page.waitForURL(/\/chat\//);
    await h.click(h.channel("general"));
    await h.send(h.composer(), "@standup give us today's standup: what moved, what's blocked, who needs help");
    h.mark("asked @standup");
    await h.agentsDone();
    h.mark("standup posted");
    await h.sleep(2500);
  },

  // Tickets: table, saved views, a ticket with blockers; finishing a blocker notifies the blocked owner.
  async "06-tickets-blockers"(page, h) {
    await page.goto(BASE + "/tickets");
    await h.sleep(2000);
    h.mark("tickets");
    await h.click(page.getByRole("button", { name: "High priority" }).first()).catch(() => {});
    await h.sleep(1500);
    await h.click(page.getByRole("button", { name: "Open" }).first()).catch(() => {});
    await h.click(page.getByText("In-app upgrade flow in Settings").locator("visible=true").first());
    h.mark("ticket blocked by ORB-4");
    await h.sleep(3000);
    await h.click(page.getByText("Stripe webhooks for plan upgrades").locator("visible=true").first());
    await h.sleep(1500);
    await h.click(page.locator("#tk-status"));
    await h.click(page.getByRole("option", { name: "Done" }));
    h.mark("blocker done -> Priya is told she's unblocked");
    await h.sleep(3500);
    await h.click(page.getByRole("button", { name: "Insights" }).first());
    h.mark("insights");
    await h.sleep(4000);
  },

  // Home, then "What did I miss?": a catch-up across channels in the Atlas DM.
  async "07-catch-up"(page, h) {
    await page.goto(BASE + "/home");
    h.mark("home");
    await h.sleep(2500);
    await h.click(page.getByRole("button", { name: /What did I miss/ }).first());
    h.mark("catch-up");
    await h.agentsDone();
    h.mark("caught up");
    await h.sleep(3000);
  },

  // The headline: a mission in flight. Check-in finds the slip, re-plans, escalates; one decision fixes it.
  async "08-missions-checkin"(page, h) {
    await page.goto(BASE + "/missions");
    h.mark("missions");
    await h.sleep(2000);
    await h.click(page.getByText("Launch paid plans").first());
    h.mark("mission board");
    await h.sleep(3500);
    await h.click(page.getByRole("button", { name: "Run check-in" }));
    await page.getByText(/slipped/).first().waitFor({ timeout: 60000 });
    h.mark("at risk: re-planned + decision raised");
    await h.sleep(4500);
    await h.click(page.getByRole("button", { name: /^Cut ORB-/ }).first());
    await page.getByText("Decided:").first().waitFor({ timeout: 30000 });
    h.mark("decided: back on track");
    await h.sleep(3000);
    await h.click(page.getByRole("button", { name: "Thread" }));
    h.mark("the agents' updates in the thread");
    await h.sleep(5000);
  },

  // A brand-new mission: goal + date in, plan streams onto the board, launch files the tickets.
  async "09-missions-new"(page, h) {
    await page.goto(BASE + "/missions");
    await h.sleep(1500);
    await h.click(page.getByRole("button", { name: "New mission" }).first());
    await h.type(page.locator("textarea").first(), "Launch the creator referral program");
    await h.click(page.getByRole("button", { name: "Plan mission" }));
    h.mark("planning (streams in)");
    await page.getByRole("button", { name: "Launch mission" }).waitFor({ timeout: 90000 });
    h.mark("draft plan");
    await h.sleep(4000);
    await h.click(page.getByRole("button", { name: "Launch mission" }));
    await page.getByRole("button", { name: "Run check-in" }).waitFor({ timeout: 60000 });
    h.mark("launched: tickets filed + owners told");
    await h.sleep(4000);
  },

  // Roles: what a guest sees vs the owner (agents act with the asker's access).
  async "10-roles"(page, h) {
    await page.goto(BASE + "/tickets");
    await h.sleep(1500);
    await h.click(page.locator("#role-select"));
    const guest = page.getByRole("option", { name: /Guest/ }).first();
    if (await guest.count()) { await h.click(guest); h.mark("viewing as guest"); await h.sleep(3500); }
    await h.click(page.locator("#role-select"));
    await h.click(page.getByRole("option", { name: /owner/i }).first());
    h.mark("back to owner");
    await h.sleep(2000);
  },
};

// ---- Runner -----------------------------------------------------------------------------
const only = process.argv.slice(2);
const names = Object.keys(SCENES).filter((n) => !only.length || only.some((o) => n.includes(o)));
const browser = await chromium.launch();
const manifest = fs.existsSync(path.join(OUT, "scenes.json")) ? JSON.parse(fs.readFileSync(path.join(OUT, "scenes.json"), "utf8")) : {};

for (const name of names) {
  const fresh = name === "01-landing";
  if (!fresh && !fs.existsSync(SESSION)) throw new Error("Run 01-landing first: it creates the demo workspace (video/out/session.json).");
  const ctx = await browser.newContext({
    viewport: SIZE, recordVideo: { dir: OUT, size: SIZE },
    ...(fresh ? {} : { storageState: SESSION }),
  });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const marks = [], t0 = Date.now();
  const h = helpers(page, marks, t0);
  process.stdout.write(`${name} … `);
  let ok = true;
  try { await SCENES[name](page, h); }
  catch (e) { ok = false; console.log(`FAILED: ${e.message.split("\n")[0]}`); await page.screenshot({ path: path.join(OUT, `${name}.error.png`) }); }
  if (fresh && ok) await ctx.storageState({ path: SESSION });
  const video = page.video();
  await ctx.close();
  const file = path.join(OUT, `${name}.webm`);
  fs.renameSync(await video.path(), file);
  manifest[name] = { file: path.basename(file), ok, seconds: +((Date.now() - t0) / 1000).toFixed(1), marks };
  if (ok) console.log(`ok (${manifest[name].seconds}s)`);
  fs.writeFileSync(path.join(OUT, "scenes.json"), JSON.stringify(manifest, null, 2));
}
await browser.close();
