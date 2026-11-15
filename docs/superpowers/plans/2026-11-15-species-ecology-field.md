# Species Habitat and Ecology Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Officers can record a species' habitat and ecology, and staff and visitors can read it, on the website and in the mobile app.

**Architecture:** One new nullable text column, `species.ecology`, threaded through the same path as `cultural_significance`: database migration, API validation and selects, OpenAPI contract, the shared client, then the web and mobile forms and pages. It stays out of the species list endpoint and the offline species cache, exactly like `cultural_significance`.

**Tech Stack:** Supabase Postgres migration, Express + Zod (`services/api`), OpenAPI (`packages/api-contract`), React + Vite (`apps/web`), Expo React Native (`apps/mobile`), `node:test` + supertest.

**Spec:** Jira CTIP-149. Project brief, Objective 2: "plant taxonomy, **ecological information**, conservation status, photographs, and cultural significance". CTIP-28 lists "ecological characteristics" as a species record field. Today the only place for it is `description`.

## Global Constraints

- Column `ecology text`, nullable. API: trimmed, 1 to 5000 characters, or null. Empty text from a form is sent as null (`speciesBody` in `apps/shared/api.js` already does this).
- The label is **"Habitat and ecology"** everywhere (forms, species pages, plant book).
- Visitors see it on published species only, the same rule as `cultural_significance`.
- The migration is additive and safe to run twice (`add column if not exists`).
- The contract changes first and needs a second person's review (`services/api/test/contract.test.js`, "contract first").
- **Database before code.** Render redeploys the API from `main` on every push, so a migration must be on the live Supabase project (**Daun Sense**, `cgtvoirktzqjqaosslfh`) before the commit that uses it is pushed. Each migration is applied first to **Daun Sense Test** (`rigeicustidfeaphwqhd`), then to live, with the Supabase MCP `apply_migration`. The MCP records the migration under the time it was applied, so rename the repo file to the version `list_migrations` shows before committing, keeping repo and database history the same. Here this matters doubly: the API selects the new column, so pushing first makes every species read answer 500 (CTIP-136 notes the same lesson).
- Mobile: read the Expo v57 docs before writing mobile code (`apps/mobile/AGENTS.md`).
- Commit straight to `main`. Commit messages carry no Claude author or session lines.

## Review Focus

1. **Migration not yet applied** when the API change deploys: every species read fails. Task 1 applies the migration before pushing, and the push step checks it.
2. **Older clients** (an APK built before this change) that never send `ecology`: create and update still work. The field is optional on create, and update is partial.
3. **Clearing the field:** an officer empties it and saves, and it is stored as `null`, not `""`. Pinned by the `speciesBody` test in Task 2.
4. **Markup in the text** (`<script>alert(1)</script>`): it shows as plain text, the same as the VA-41 check. No page may render it with `dangerouslySetInnerHTML` or a WebView. Task 2 adds a grep check for this.
5. **Unpublished species:** their ecology never reaches visitors. The existing public test (unpublished answers 404) still passes, and the allowed-keys test now includes `ecology`.

---

### Task 1: Database, API and contract

**Files:**
- Create: `supabase/migrations/20261115000000_species_ecology.sql`
- Modify: `services/api/src/species.js:9-10` (`COLUMNS`), `:18-26` (`fields`), `:30-39` (`SpeciesCreate`)
- Modify: `services/api/src/handlers.js:31-32` (public species detail select)
- Modify: `packages/api-contract/openapi.yaml` (the three species schemas holding `cultural_significance`, about lines 2527, 2553 and 2579)
- Test: `services/api/test/species.test.js`, `services/api/test/public-species.test.js`

**Interfaces:**
- Produces: species rows and API responses carry `ecology: string | null`. Tasks 2 and 3 read and send that name.

- [ ] **Step 1: Write the failing tests**

In `species.test.js`:

```js
test('officer saves habitat and ecology on create and update', async () => {
  const res = await create({ scientific_name: 'Nepenthes rajah', ecology: 'Montane forest on ultramafic soil' });
  assert.equal(res.status, 201);
  assert.equal(res.body.ecology, 'Montane forest on ultramafic soil');
  const upd = await request(app).patch(`/v1/species/${res.body.id}`).set(as('officer')).send({ ecology: null });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.ecology, null);
});

test('ecology over 5000 characters is 422 with the field named', async () => {
  const res = await create({ scientific_name: 'Nepenthes rajah', ecology: 'x'.repeat(5001) });
  assert.equal(res.status, 422);
  assert.deepEqual(res.body.details.fields.map((f) => f.path), ['ecology']);
});
```

In `public-species.test.js`, add `'ecology'` to the `allowed` key list in "only published fields are returned…", and add `ecology: null` to the published fixture row (next to `cultural_significance`, about line 19).

- [ ] **Step 2: Run the tests to check they fail**

Run: `npm --prefix services/api test`
Expected: FAIL. The new create returns 422 for the unknown key `ecology`, and the public keys test fails on the missing key.

- [ ] **Step 3: Implement**
  - Migration: `alter table public.species add column if not exists ecology text;`, with a header comment in the style of the other migrations (what it adds, CTIP key, "safe to run more than once").
  - `species.js`: add `ecology` to `COLUMNS`, `ecology: text(5000).nullable()` to `fields`, and `ecology: fields.ecology.optional()` to `SpeciesCreate`.
  - `handlers.js`: add `ecology` after `cultural_significance` in the public detail select. Leave the list select (about line 72) alone.
  - OpenAPI: add `ecology` beside `cultural_significance` in the three schemas, with the same type and limits.

- [ ] **Step 4: Run the tests to check they pass**

Run: `npm --prefix services/api test`
Expected: PASS, including `contract.test.js`.

- [ ] **Step 5: Apply the migration, test project first, then live.** Use `apply_migration` with name `species_ecology` on `rigeicustidfeaphwqhd`, then on `cgtvoirktzqjqaosslfh`. On each, `execute_sql` `select ecology from public.species limit 1;` must run without error. Rename the repo file to the version `list_migrations` reports on live. Do not push Step 6 until both succeed.

- [ ] **Step 6: Commit and push** (after the contract review)

```bash
git add supabase/migrations/20261115000000_species_ecology.sql services/api/src/species.js services/api/src/handlers.js packages/api-contract/openapi.yaml services/api/test/species.test.js services/api/test/public-species.test.js
git commit -m "CTIP-149: species habitat and ecology field in the database, API and contract"
git push origin main
```

---

### Task 2: Shared client and website

**Files:**
- Modify: `apps/shared/api.js:470-478` (add `"ecology"` to `SPECIES_FIELDS`; export `speciesBody`)
- Modify: `apps/shared/selectors.js:167-168` (`bookEntries` keeps `ecology`)
- Modify: `apps/shared/data.js:15` (sample species get `ecology: ""`)
- Modify: `apps/web/src/components/SpeciesForm.jsx` (a textarea after line 62, `rows="3"`, same pattern)
- Modify: `apps/web/src/pages/SpeciesPage.jsx:78`, `PublicPlant.jsx:79`, `Specimen.jsx:187` (a `<dt>Habitat and ecology</dt><dd>…</dd>` pair before the cultural note), `Book.jsx:49` (`<p><b>Habitat and ecology:</b> …</p>`)
- Test: `apps/shared/test/species-ecology.test.js`

**Interfaces:**
- Consumes: `ecology` on species from Task 1.
- Produces: `speciesBody(sp) -> object`, now exported. Task 3 relies on mobile sending through the same function.

- [ ] **Step 1: Write the failing test**

```js
import { speciesBody } from "../api.js";
import { bookEntries } from "../selectors.js";

test("speciesBody sends ecology trimmed, and an empty one as null", () => {
  assert.equal(speciesBody({ scientific_name: "X", ecology: "  Peat swamp  " }).ecology, "Peat swamp");
  assert.equal(speciesBody({ scientific_name: "X", ecology: "   " }).ecology, null);
});

test("the plant book keeps a species' habitat and ecology", () => {
  const [e] = bookEntries([{ id: "1", scientific_name: "X", is_published: true, is_deleted: false, ecology: "Peat swamp" }]);
  assert.equal(e.ecology, "Peat swamp");
});
```

- [ ] **Step 2: Run to check it fails**

Run: `cd apps/shared && node --test`
Expected: FAIL, `speciesBody` is not exported.

- [ ] **Step 3: Implement the shared changes and the four web pages and form** listed under Files.

- [ ] **Step 4: Run tests, lint and build**

Run: `cd apps/shared && node --test && cd ../web && npm run lint && npm run build`
Expected: all pass.

Run: `grep -rn "dangerouslySetInnerHTML" apps/web/src | grep -i "ecology"`
Expected: no output.

- [ ] **Step 5: Check in the browser** (`npm --prefix apps/web run dev`, signed in as an officer): add ecology text containing `<b>x</b>`, save, and see it as plain text on the species page and, once published, on the visitor plant page.

- [ ] **Step 6: Commit and push**

```bash
git add apps/shared apps/web/src
git commit -m "CTIP-149: habitat and ecology on the website"
git push origin main
```

---

### Task 3: Mobile app

**Files:**
- Modify: `apps/mobile/components/SpeciesForm.js:53` (an `Area` "Habitat and ecology", `optional`, `rows={3}`, before cultural significance)
- Modify: `apps/mobile/pages/Species.js` (state beside `culturalSignificance` at about line 324, the body at about line 341, the input at about line 496)
- Modify: `apps/mobile/pages/PlantPage.js:168` (a `Section title="Habitat and ecology"` before the cultural one), `apps/mobile/pages/Book.js:39` (one line, same style)

**Interfaces:**
- Consumes: `ecology` on species (Task 1), sent through `speciesBody` (Task 2).

- [ ] **Step 1: Implement** the four files, copying the `cultural_significance` pattern in each.

- [ ] **Step 2: Run the mobile tests**

Run: `npm --prefix apps/mobile test`
Expected: PASS (no regressions; these screens have no unit tests).

- [ ] **Step 3: Check on a phone** (Expo, signed in as an officer): edit a species, add habitat and ecology, save, then open a plant of that species and the plant book. The text shows in both. Clearing it removes the section.

- [ ] **Step 4: Commit and push**

```bash
git add apps/mobile
git commit -m "CTIP-149: habitat and ecology in the mobile app"
git push origin main
```
