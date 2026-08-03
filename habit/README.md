# Habit Now — marketing site

Static HTML, CSS and JavaScript. No build step, no framework, no database.
One page is PHP — the deletion request form, which needs to write a file.

```
index.html            the landing page — the tree grows as you scroll
terms.html            terms of use
privacy.html          privacy policy
support.html          support + FAQ, mailto only
delete-account.php    account deletion request form  ← the only dynamic page
data/                 where its requests land (created on first submit)
css/site.css          all styles
js/site.js            all behaviour
assets/               fonts, art, icon
tools/                the asset pipeline (build-time only, never shipped)
```

> **Hosting note.** That one page means the site can no longer go on
> Cloudflare Pages, Netlify or GitHub Pages as-is — none of them execute PHP.
> Any ordinary PHP host (shared hosting, a VPS with nginx + php-fpm) serves the
> whole thing unchanged. If you'd rather stay on a static host, the form has to
> be rewritten against a form service or a serverless function; everything else
> on the site is still plain static files.

Run it locally with anything that serves files:

```bash
python3 -m http.server 8000
```

---

## After editing css/site.css — bump the version

Every page links the stylesheet as `css/site.css?v=YYYYMMDD`. **Change that
date whenever you change the CSS**, in all five pages, or your edit will not
reach anyone who has already loaded the site.

Cloudflare serves the assets with `cache-control: public, max-age=604800` and
holds them at the edge for a week — a deploy alone does not dislodge them. It
does *not* cache the HTML (`cf-cache-status: DYNAMIC`), so a changed query
string is fetched fresh the minute the deploy cron pulls, which is what makes
this work. Without the bump the only remedy is a manual purge in the
Cloudflare dashboard, and a browser that already has the file keeps its copy
for the full seven days regardless.

`js/site.js` is still unversioned and carries the same risk.

---

## Before launch — one thing to fill in

Search for `TODO` and you will find it.

| # | Where | What |
|---|-------|------|
| 1 | `index.html`, two `<!-- TODO -->` blocks (hero and `#get`) | Replace the four `href="#"` on the App Store / Google Play buttons with the real store URLs. |

Everything else in the two legal documents is written against how the app
actually behaves — the Supabase schema, the auth service, what the coach packet
contains, RevenueCat, the sprite CDN. **If any of that changes, those documents
are wrong and need editing.** They are not boilerplate.

---

## Account deletion requests

Google Play requires a publicly reachable URL where deletion can be requested
**without the app installed**, for people who already uninstalled. That's
`delete-account.php`. In-app deletion (Profile → Delete account) stays the
primary path and is what most people will use.

The form does not delete anything. It can't safely: the page is
unauthenticated, so acting on a submission directly would let anyone delete
anyone else's account by typing their address. It queues instead, and you
action each one by hand after replying to confirm the requester owns the
address.

Requests land in `data/delete-requests.log.php`, one JSON object per line:

```json
{"at":"2026-07-30T11:17:37+00:00","email":"jane@example.com","note":"","done":false}
```

Flip `done` to `true` by hand once you've erased the account, so the file
doubles as your record of what's been handled.

**Why that filename.** It sits under the web root, and a `.txt` would be
downloadable by anyone who guessed the name — a list of the email addresses of
people asking to be forgotten is the worst thing on this site to leak. The
`.php` extension plus the `<?php exit; ?>` first line means a direct hit
renders nothing, even on servers that ignore the `.htaccess` written alongside
it (nginx, Caddy). Read it over SSH; every line after the first is plain JSON.

To erase an account for real, delete the `auth.users` row in Supabase — every
table cascades from it. See `habitbuilder.delete_account()` in
`HabitBuilder-code/supabase/schema.sql`.

Spam handling is deliberately minimal: a honeypot field bots fill in and humans
never see (those submissions are silently dropped, and the page still says
"received" rather than announcing the trap), and a 4 MB cap on the log. If it
ever gets hammered beyond that, add rate limiting.

---

## The art

All of it comes from the app's own sprite sheets, rebuilt at web sizes by
`tools/build_assets.py`. The outputs are committed, so you only re-run it when
the art changes:

```bash
python3 tools/build_assets.py     # needs Pillow, and the art repo next door
```

It reads from the sibling repos described in `HabitBuilder-code/README.md`: the
hero from the PNG masters in `HabitBuilder/art/`, the stage stills and ornaments
from `HabitBuilder/cdn/sprites/`.

Two kinds of output, because there are two kinds of motion on the page:

- **Sprite sheets**, played frame by frame with CSS `steps()` — the hero's
  stage-2 idle loop and the ornament creatures. Sheets with transparency are
  expensive, so only those get one.
- **Single stills**, one per stage, for the scroll acts. 57 KB against 230 KB
  for even a heavily trimmed idle sheet. The page gives them their life with a
  CSS sway instead, and at scroll speed nobody can tell.

### The hero is built to a different standard

It is the first thing anyone sees, so `idle-2.webp` comes off the **PNG master**
in `HabitBuilder/art/`, not the shipped WebP. Both are the same pixel
dimensions, but the WebP is already lossy, and re-encoding it stacks a second
generation of artefacts onto the one image that has to look best. It is built at
the master's full 512px frames, q90 — the only asset on the site built purely
for quality. `IDLE_PX` / `IDLE_Q` in `tools/build_assets.py` are the dials.

It loads in two layers:

| layer | what | when |
|---|---|---|
| `stage-2.webp` | the rest pose, 35 KB — the same file act 1 grows into, so it is one fetch for both | paints immediately |
| `idle-2.webp` | 5×5 / 25 frames, 555 KB | crossfades in over 400 ms once decoded |

So the hero is never an empty box waiting on half a megabyte, and if the sheet
never arrives the still simply stays — which is a perfectly good hero. Readers
on `prefers-reduced-motion`, and anyone without JavaScript, keep the still for
good.

> **There used to be a sprouting animation here** — the app's 64-frame stage-0
> `grow` sheet, seed to sprout, played once on load. It was cut because the
> animation did not look good at web size, not because of its weight. The build
> script deletes its outputs if an older run left them behind.

Cropping every frame to the artwork's bounding box was measured and rejected: it
removes 41% of the canvas but only ~3% of the bytes, because WebP already
compresses a uniformly transparent margin to almost nothing.

### Weight

Measured in a real browser, not estimated:

| | requests | transferred |
|---|---|---|
| Hero settled into its idle loop | 11 | 883 KB |
| Whole page, scrolled to the bottom | 17 | 1172 KB |
| **`prefers-reduced-motion`** | 10 | **387 KB** |

Nothing on that list blocks the headline or the store buttons, which paint
immediately, or the tree, which is on screen from the first paint. The acts
fetch one stage ahead of where you are, so the lower page only costs what you
actually scroll to. Readers who ask for reduced motion never download the
animation sheet at all — its `<link rel="preload">` carries a
`media="(prefers-reduced-motion: no-preference)"`.

### Serving the art from R2 instead

`js/site.js` opens with:

```js
var ASSET_BASE = "";
```

Set it to a URL with a trailing slash and every image — including the two CSS
background sprites in the hero, which the script repoints for you — comes from
there instead:

```js
var ASSET_BASE = "https://habitsprites.nowapps.cc/sprites/web/v1/";
```

To do that, upload the contents of `assets/` (the `tree/` and `orn/` folders) to
that prefix in the same R2 bucket the app uses.

> **Do not point `ASSET_BASE` at `sprites/v1/`.** That prefix is the app's
> full-resolution set — 69 MB, where a single idle sheet is larger than this
> entire site. It is correct for a native app that downloads once and caches to
> disk, and fatal for a web page.

---

## How the landing page works

The whole page is one idea: the tree grows while you scroll, so the visitor
performs the app's core loop by doing the only thing they were going to do.

**Act 0 — the hero.** The tree is on screen from the first paint, at stage 1,
and starts breathing as soon as its idle sheet decodes. Text and the store
buttons never wait on any of it.

**Acts 1–4.** The tree pins to a sticky stage and the copy scrolls past it,
which is what the tree does at the top of the app's Today screen
(`lib/widgets/sticky_hero.dart`). Each `<article class="act">` declares what the
tree should be doing:

```html
<article class="act" data-frames="5,5-h50,5-h25,5-h50,5" data-sky="2">
```

`data-frames` is the list of stage stills to step through as that act scrolls —
`5-h50` is stage 5 at 50% health, which is how the wilt act drains and recovers.
`data-sky` picks the sky. `data-orn` turns on the ornaments. To retime the
sequence, edit those attributes; no JavaScript needs touching.

**The sky** runs one day from top to bottom — morning in the hero, grey through
the wilt, gold, dusk, then a quiet settled sky for the factual sections below.
Six stacked gradients cross-fading, rather than one gradient recomputed on every
scroll frame.

---

## Typography

Three faces, one rule that holds across every page:

| Face | Role |
|---|---|
| **Fraunces** | The tree talking. Every first-person line is set in it. |
| **Nunito** | Headings, labels, numerals, buttons — the app's own display face. |
| system stack | Body copy. The app leaves `fontFamily` unset so iOS renders it in SF Pro; the site does the same, so paragraphs match on the target device. |

Serif means the tree; sans means facts. The reader picks it up in the hero
without being told.

Both webfonts are self-hosted latin subsets in `assets/fonts/` (159 KB the
pair), so the site makes **no external requests at all** — no CDN, no Google
Fonts, nothing to block or leak.

---

## Accessibility and degradation

- **No JavaScript**: every page renders, reads and links correctly. The tree
  stops growing; nothing is hidden, because the reveal class is added by script
  rather than sitting in the markup.
- **`prefers-reduced-motion`**: the idle loop, the sway, the drifting clouds, the
  leaf bursts and the reveals all switch off. Stage changes still happen — they
  carry meaning — but instantly, and the sprite sheets hold a single frame.
- Skip link, visible focus rings, real landmarks and heading order, decorative
  sprites hidden from assistive tech.
