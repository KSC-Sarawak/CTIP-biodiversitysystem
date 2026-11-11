# Branch `rick-UI-UX-upgrade`: Daun v2 website redesign

*Written 11 Nov 2026. Covers everything on this branch from when it was created (11 Nov, 16:36,
from `9ce22a5`) up to `7f29947`. Web app only (`apps/web` plus two small additions to
`apps/shared/tokens.js`). No API, database or mobile app changes come from this branch.*

| Commit | When | What |
|---|---|---|
| `9ce22a5` | 11 Nov 16:36 | Starting point: the Monitoring IoT dashboard (CTIP-39, 79, 81, 82). The same work is on `main` as `97fb767` (#69). |
| `670130d` | 11 Nov 20:52 | Daun v2 look, new staff home page, Back button, "done" panel after a review decision |
| `9655152` | 11 Nov 21:08 | One shared page header (`PageHead`) on every staff page |
| `7f29947` | 11 Nov 21:12 | Merge of the latest `main` into this branch (3 conflicts fixed, see [section 8](#8-merge-with-main-7f29947)) |

Compared with `main`: 28 files, 6 of them new, about 2,000 lines added and 440 removed.

Read [Take note](#take-note) before merging.

---

## Contents

1. [Daun v2 design basics: fonts, shadows, colours, motion](#1-daun-v2-design-basics)
2. [New staff home page (`#/dashboard`)](#2-new-staff-home-page)
3. [Shared page header on staff pages (`PageHead`)](#3-shared-page-header-pagehead)
4. [Back button, and a "done" panel after a review decision](#4-back-button-and-the-done-panel)
5. [Public pages: Home, About, Contact, Catalogue, Map, Sign in](#5-public-pages)
6. [Discussion page](#6-discussion-page)
7. [Tests changed](#7-tests-changed)
8. [Merge with main (`7f29947`)](#8-merge-with-main-7f29947)
9. [Take note](#take-note)
10. [How to check it](#how-to-check-it)

---

## 1. Daun v2 design basics

`apps/shared/tokens.js`, `apps/web/src/theme.js`, `apps/web/index.html`, `apps/web/src/App.css`

**Fonts.** The website now uses **Inter** for everything you read or tap, and **Fraunces 600**
only for the one big headline on a page. **Nunito is no longer loaded on the website.**
JetBrains Mono stays for tag IDs.

- New `webFonts` and `webType` in `tokens.js`. `theme.js` uses these on the website. They are
  merged over the existing `typeScale`, so every old `--t-*` CSS variable still exists.
- New type sizes: `hero` (96 px), `greeting` (44 px), `bodyLg`. Body text gets more line height.
- Weights: 400 for reading, 600 for titles and buttons, 700 only for small capitals (overlines).
- The mobile app still uses Nunito and the old `typeScale`. It has not changed.

**Depth.** Three shadow levels now work in **both** themes. Dark mode used to have no shadows.

| Variable | Used for |
|---|---|
| `--shadow` | resting cards |
| `--shadow-lift` | hovered cards, the search bar, popovers |
| `--shadow-pop` (new) | a lifted plant card, dialogs |
| `--hl` (new) | 1 px highlight on the top inside edge of a card |

**Colours.** Two new tokens, `washLeaf` and `washWater` (`--wash-leaf`, `--wash-water`). These are
soft colour washes behind the big headers. Both have light and dark values.

**Motion.** New `motion.enter` (560 ms, `--m-enter`), used once when a page's headline and cards
first rise in. Everything that moves stops under the device's reduced-motion setting.

**Icons.** `Icon` takes an optional `className` (used for the spinning refresh icon).

## 2. New staff home page

New `apps/web/src/pages/StaffHome.jsx`. Routing is in `apps/web/src/pages/Dashboard.jsx`.

**Route change:**

| Link | Before | Now |
|---|---|---|
| `#/dashboard` | Table of tagged plants | **Staff home** (new) |
| `#/dashboard/all` | (did not exist) | Table of tagged plants (same table as before) |
| `#/dashboard/NIAH-0001` | Plant page | Plant page (unchanged) |
| `#/dashboard` as a visitor | Species catalogue | Species catalogue (unchanged) |

The side menu now has **Home** (`#/dashboard`) and **Tagged plants / My plants**
(`#/dashboard/all`) as two separate links.

The home page has three parts:

1. **Greeting and one sentence** saying what is waiting, for example "Good morning, Alice ·
   Officer dashboard — 3 records are *waiting for you.*" A **Checked 14:05** button refreshes
   from the API.
2. **One focus card** with the next thing to do and one main button. What it shows depends on the role:
   - **Botanist:** records returned by an officer, with the officer's note and **Fix and resend**.
     If none are waiting, a card to **Add a plant**.
   - **Officer:** records waiting for review, oldest first. Each shows who recorded it, how many
     photos it has and how long it has waited, with **Review this record** (opens `#/tag/<id>`)
     and **Open the queue**.
   - **Admin:** turned-off accounts waiting for access, with **Review this request**.
   - **Officer or admin with an empty queue:** open sensor alerts, if there are any.
   - Otherwise: "You're all caught up."

   When several items are waiting, the card pages through them with arrow buttons, dots, or the
   ← / → keys. The keys do nothing while you are typing in a field.
3. **Doors.** A row of links to the role's other pages. Each has a one-line hint, or a count
   when something there needs attention (for example "2 open alerts"). A door the focus card
   already links to is left out.

The focus card shows the plant's photo over a leaf in the plant family's colour. If the photo
cannot load, only the leaf shows.

## 3. Shared page header (`PageHead`)

New `apps/web/src/components/PageHead.jsx`. Every staff page now opens the same way:

1. a small label and the page name,
2. **one sentence** saying what needs doing, with a coloured mark for how urgent it is
   (`ok` green, `info` blue, `warn` gold, `bad` red),
3. a row of **number tiles**. A tile with `onClick` is a filter: it stays pressed while in use
   (`aria-pressed`). A tile with `href` is a link.

The page's main buttons sit on the right, or under the sentence on phones.

| Page | Sentence (examples) | Tiles |
|---|---|---|
| Tagged plants (`#/dashboard/all`) | "4 plants are waiting for review." | The saved views (Needs review, Returned, …). **These replace the old pill row.** |
| Review queue | "5 records are waiting for a decision. The oldest has waited 3 days." | Needs review / Returned / … **These replace the old filter pills.** |
| My records (botanist) | "2 records were returned to you. Fix them first." | Returned / Not sent yet / With an officer / Published / All |
| Monitoring | "2 open alerts need your attention." | Open alerts (links to `#attn`), nodes online, offline, outside limits, readings in 24 h |
| Reports | "120 tagged plants, 80 published. Select a bar below…" | Tagged, Published, Endangered, Waiting for review (links to `#/review`) |
| Species | "3 species are not published yet…" | Species, Published, Not published, Threatened |
| QR tags | "12 unused tags are ready to print…" | Ready, On a plant, Kept for a botanist, Retired |
| Users | "2 accounts are turned off and may be waiting for access." | Active, one per role, Not active |
| Audit log | "Who changed what, newest first. N entries…" | none |

Other changes on these pages:

- **My records:** records **returned** to the botanist now always sort to the top. The "Not sent
  yet" tile also shows `queued` records, not only `draft`. The search box uses the standard
  `.search` style instead of inline styles. The status pill row is gone; the tiles do that job.
- **Review queue:** the Sort dropdown moved to the right side of the header.

## 4. Back button and the "done" panel

New `apps/web/src/components/BackButton.jsx`

- Every page inside the staff `Shell` now has a **Back** button at the top. The staff plant page
  (`Specimen`) has one too.
- It goes back one step in the browser **only if you have already moved between pages in this
  tab**. If the page was opened directly (a link, a new tab, a refresh), it goes to a fallback
  page instead of leaving the site: `#/dashboard` by default, `#/dashboard/all` on the plant page.

**After a review decision**, a panel now says what happened, so the officer is not left on a
page that has silently changed:

- **Review queue:** "NIAH-0001 approved and published" (or returned / rejected), how many records
  are still waiting, **Back to previous page**, and a close button.
- **Plant page** (officer review card): "Approved and published", "NIAH-0001 is done…",
  **Back to previous page** and **Next in the queue**.
- `ReviewDetail` now calls `onDecided(decision, qr)` only when the decision succeeded. On
  `WRONG_STATUS` (someone else decided first), it reloads with no panel, as before.

## 5. Public pages

**Home** (`Public.jsx`, `Home`)

- The headline's last words (the park name) are highlighted.
- Behind the headline: new **`CanopyLight`**, a canvas of faint drifting specks of light joined
  by thin lines, and new **`ForestScene`**, an illustrated Niah rainforest drawn in SVG with
  karst and a cave mouth, emergent trees, ferns and mist. Both use theme colours, are hidden
  from screen readers, and stay still under reduced motion. `CanopyLight` also pauses while the
  tab is in the background.
- **The Unsplash hero photo is removed from the home page.** The big scan card is now one line:
  "In the forest? [Scan a plant tag]".
- **"How a plant gets here" moved to the About page.** The "Browse all plants" / "Open the plant
  map" text links are removed. "Recently added" shows 4 cards instead of 6.

**About** (new full page, was one paragraph)

- A header with the forest art and a canopy photo (Unsplash). If the photo fails to load, the
  drawing shows instead. The page has **Browse the plants** and **Open the map** buttons.
- Live counts that count up once: plants published, species, plant families.
- Sections: "Why it exists" (with a drawn QR tag), "How a plant gets here" (3 steps with icons),
  "Built for the forest" (4 features), "Who it is for" (3 audiences), partners, and a closing
  "Step into the forest" band.

**Contact** (new full page)

- A form with topic, optional tag ID (only for "A plant or its record"), optional name, and a
  message. **Nothing is sent from the website:** **Open in my email app** opens a `mailto:` link
  filled in with the message. An empty message shows "Write a message first".
- Cards: email address with **Copy address**, organisation and address, a tip to include the tag
  ID, and how to get a staff account.

**Species catalogue** (`Catalogue.jsx`)

- A big header with forest art. The **search bar is the first thing on the page**, and pressing
  **`/`** anywhere jumps to it.
- Counts under the search: species, tagged plants, threatened.
- **Browse by family:** a row of family cards you can swipe or scroll with the arrow buttons,
  coloured like the map. This replaces the family pill list.
- A slim bar shows how many species match, one removable chip per filter in use, **Clear
  filters** (when more than one is in use), Genus (only when there is more than one genus),
  Sort and the grid/list switch.
- Staff only: the conservation status pills and the **Sync API** button sit in their own row.
- Changing page scrolls back to the top of the results.
- **Plant book** and **Show plants on the map** moved from the header to two links at the
  bottom of the page.

**Map** (`MapPage.jsx`)

- New layout: a side panel (search, "N plants on the map", **Show all**, family legend, hidden
  endangered count) beside the map, which now fills its column (`height="100%"`).
- The long explanation moved into a "How to read the map" fold-out.
- **Fix:** the family counts in the legend now count the search results in **every** family.
  Before, picking a family made every other family show 0.

**Sign in** (`Login.jsx`)

- Two columns: a welcome panel with the forest art ("Welcome back to the forest.") and the
  sign-in card. The forms themselves did not change.

## 6. Discussion page

`Discussion.jsx`

- A new header with a speech-bubble drawing, a **New discussion** button, and counts: new,
  sent to you, in total.
- Every thread and every post shows a round **avatar** with the person's initials, coloured by
  role. Record comments show a leaf instead.
- Thread rows end with a › arrow. The "no discussions" message has a small drawing.

## 7. Tests changed

- `tests/agent-audit.spec.js`: the officer review test now starts at `#/dashboard/all`, because
  `#/dashboard` is the home page now.
- `tests/role-pages.spec.js`: the "How a plant gets here" check now opens `/#/about`, because
  the steps moved there.
- No new tests were added for StaffHome, PageHead, BackButton, the done panel, or the Contact form.

## 8. Merge with main (`7f29947`)

`main` brought in 3 commits: `f3c5469` (CTIP-16 offline review fixes, #68), `97fb767` (Monitoring
IoT dashboard, #69) and `fe252b0` (mobile offline mode and navigation polish). Three files
conflicted. Each one kept this branch's side, and main's other changes in those files merged in
normally:

| File | Conflict | Kept |
|---|---|---|
| `Specimen.jsx` | `decided` state (this branch) | This branch, because the done panel needs it. Main's bigger QR code popup (`qrBig`) is in. |
| `SensorOverview.jsx` | `PageHead` vs main's plain header; a second copy of the node map block | `PageHead`. Main's copy of the node map was dropped, because the map is already right above it, so the page has one map. |
| `App.css` | Font weight 600 vs 700 in `.enlarge-hint`, `.sortbtn`, `.nodecard > .textlink` | 600, to match the Daun v2 weights |

After the merge, `eslint src` is clean and `vite build` passes.

---

## Take note

1. **`#/dashboard` now goes to the home page, not the table.** Old links, bookmarks and emails
   that expect the table should use `#/dashboard/all`. The Send-to email on the table page
   already uses the new link.
2. **The plant page breadcrumb still says "Tagged plants" but links to `#/dashboard`**, which is
   now the home page (`Specimen.jsx`, line 85). It should probably link to `#/dashboard/all`.
   Not fixed yet.
3. **The Back button can leave the site in one case:** open a page directly, move to another
   page, press Back, then press Back again. Once you have moved, `BackButton` always calls
   `history.back()`. It does not know whether the previous entry is inside the site.
4. **The staff home page has no side menu.** `StaffHome` is not wrapped in `Shell`, so it has
   no staff menu and no Back button. You get around using its doors and the top navigation.
5. **The home focus card shows at most 8 dots.** With more than 8 waiting items, the arrows and
   keys still reach every item, but the dots stop at 8.
6. **Fonts:** the website loads Inter and Fraunces 600 from Google Fonts and no longer loads
   Nunito. The mobile app is unchanged, so the two apps now look different until the mobile
   fonts are swapped too (see the note in `tokens.js`).
7. **About page content is written into the page:** the partner list (Sarawak Forestry
   Corporation, NeuonAI Sdn Bhd, Swinburne University of Technology Sarawak), the "paper
   notebooks" story, and the feature claims. Check these with the team and client before a demo.
   The canopy photo still comes from Unsplash.
8. **The Contact form does not send anything.** It only opens the visitor's email app. If the
   visitor has no email app set up, nothing happens.
9. **Photos missing on the live database (not caused by this branch):** all 43 observation
   photo rows and 15 species media rows on the Supabase project `rigeicustidfeaphwqhd` point to
   files that are not in storage, so every one of those photos shows as an empty box. Upload the
   files again under the same paths, or remove or re-seed those rows. Photos uploaded since
   8 Nov are fine.
10. **Mobile:** the merge from `main` changed `apps/mobile/package.json`. Run `npm install` in
    `apps/mobile` before running the field app.

## How to check it

```bash
cd apps/web
npx eslint src          # clean after the merge
npx vite build          # passes after the merge
npx playwright test     # web tests
```

By hand, as each role (botanist, officer, admin) and as a visitor:

- `#/dashboard`: greeting, focus card (try ← / →), doors with counts.
- `#/dashboard/all`: the table, with the tiles working as filters.
- `#/review`: approve one record and check the done panel and Back.
- `#/plants`: press `/`, pick a family card, remove a filter chip.
- `#/map`: pick a family and check the other families keep their counts.
- `#/about`, `#/contact`, `#/staff`: in light and dark mode, and with reduced motion turned on.
