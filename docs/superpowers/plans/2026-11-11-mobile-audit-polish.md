# Mobile Audit and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bugs found in the 11 Nov 2026 audit of `apps/mobile` and polish its UI/UX so the app is correct and feels finished for the 23 Nov demo (code freeze 19 Nov).

**Architecture:** The hand-rolled stack navigator keeps covered screens mounted (hidden, not destroyed) so going back restores scroll, search, filters and forms; a focus context lets hidden screens pause polling, GPS and the camera. One shared empty-state component and one offline strip replace misleading "empty" messages. Everything else is local fixes inside existing screens and the shared UI kit (`components/bits/`).

**Tech Stack:** Expo 58, React Native 0.88, React 19, plain JavaScript, `node:test` for pure-logic tests. No new dependencies.

**Spec:** None. The audit findings and the three decisions below were agreed in chat on 11 Nov 2026 and are recorded here.

## Decisions (from the product owner, 11 Nov 2026)

1. **Back behaviour:** keep previous screens alive (mounted, hidden).
2. **Offline state:** add an app-wide offline strip, and show loading skeletons or an offline message in place of false "empty" messages.
3. **Confirmations:** add all four: changing a user's role, discarding a form (Revisit close, Android back on Add plant and Revisit), rejecting a record, signing out.

## Global Constraints

- Work on `main`. **No new branch, no commit, no push.** Every task ends by staging its files with `git add` (or `git rm` for deletions).
- No Claude attribution anywhere.
- Mobile only. `apps/shared` changes are limited to Task 5's additive return values.
- No new dependencies. `@react-native-async-storage/async-storage` is already installed.
- The app is on Expo 58: read https://docs.expo.dev/versions/v58.0.0/ for any Expo API touched (`apps/mobile/AGENTS.md` still says v57; leave that file alone and tell the owner).
- Colours come only from the theme (`useTheme().c`) or `palettes` in `apps/shared/tokens.js`. No new hex values.
- Touch targets are at least 48 high (`touch.phone` in tokens): where the visual stays smaller, add `hitSlop` to reach 48.
- Press feedback is `opacity: pressed ? 0.7 : 1`, the pattern `Row` already uses.
- Copy: sentence case for every title and button; the single character `…` for ellipses; no emoji; plain words, no jargon.
- Anything that moves respects the phone's "reduce motion" setting.
- Before changing any on-screen string, grep `apps/mobile/tests` for it and update the test in the same task.
- All commands run from `apps/mobile` unless a path says otherwise.

## Verification commands

- **Unit tests:** `node --test tests/*.test.mjs` . Baseline on main today: 2 failures, both stale tests (see Task 0). After Task 0: 1 known failure (`zoomToShowLayer`), nothing else.
- **Shared tests:** `node --test` in `apps/shared`. Expected: all pass.
- **Bundle check:** `npx expo export --platform android --output-dir "<scratchpad>/export"`. Expected: exits 0 and prints the exported bundle. This proves every import resolves and every file parses.
- There is no emulator or `adb` on the development machine, so on-screen behaviour is checked by the owner with the phone checklist in Task 14.

## Review Focus

Failure modes no unit test fully covers, most likely first:

1. **More than five screens deep, then back repeatedly:** older screens are rebuilt on return and must not crash or show another screen's content. Pinned by `mountedEntries` tests in Task 1; behaviour on the phone in Task 14.
2. **Sign-out or role change with screens kept alive:** every kept screen must be destroyed so no staff data stays on screen. Pinned by the `resetTo` test in Task 1.
3. **Cold start with no signal and no data:** lists show skeletons, then the offline message, never "No … yet". Pinned by `emptyKind` tests in Task 4.
4. **Hardware back while a form with a discard guard is hidden under another screen:** the guard must not fire. `useBackHandler` only registers while focused (Task 2); checked on the phone in Task 14.
5. **Keyboard open when navigating:** the keyboard closes and the next screen is not left shrunk. `Keyboard.dismiss()` on every navigation (Task 2); checked on the phone in Task 14.

---

### Task 0: Baseline and stale test

**Files:**
- Modify: `apps/mobile/tests/agent-mobile-advanced.test.mjs:52`
- Modify: `apps/mobile/package.json` (the `test` script)

- [ ] **Step 1:** Run `node --test tests/*.test.mjs`. Expected: exactly 2 failures: "CTIP-71 Privacy…" (expects 4 decimals; `components/format.js` formats 5 by design) and "generateMapHtml includes smooth zoomToShowLayer…".
- [ ] **Step 2:** In `agent-mobile-advanced.test.mjs` change the expected string `"3.8167, 113.7833"` to `"3.81667, 113.78333"`.
- [ ] **Step 3:** Leave the `zoomToShowLayer` test alone: whether `apps/shared/mapHtml.js` should call it is a shared-code question for the owner. Report it in the final summary.
- [ ] **Step 4:** In `package.json` change `"test"` to `node --test tests/*.test.mjs` so the tests added by this plan run under `npm test`. Leave `test:agent` as it is.
- [ ] **Step 5:** Run the unit tests. Expected: 1 failure (`zoomToShowLayer`).
- [ ] **Step 6:** `git add apps/mobile/tests/agent-mobile-advanced.test.mjs apps/mobile/package.json`

---

### Task 1: Stack model (pure)

**Files:**
- Create: `apps/mobile/navigation/stack.js`
- Test: `apps/mobile/tests/navigation-stack.test.mjs`

**Interfaces:**
- Produces (all pure, no React Native imports):
  - `entry(name, params = {})` → `{ key: string, name, params }`, `key` unique per call (module counter, e.g. `"s12"`).
  - `resetTo(name)` → `[entry(name)]`
  - `push(stack, name, params)` → new stack with one more entry
  - `replaceTop(stack, name, params)` → new stack; the top entry **keeps its key when `name` is unchanged** (the Plants tab switches its list this way and must not remount), otherwise gets a new key
  - `pop(stack)` → stack without its top entry; a one-entry stack is returned unchanged
  - `mountedEntries(stack, keep = 5)` → the last `keep` entries (the ones the navigator renders)
  - `KEEP_MOUNTED = 5`

- [ ] **Step 1: Write the failing tests** in `navigation-stack.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entry, resetTo, push, replaceTop, pop, mountedEntries, KEEP_MOUNTED } from '../navigation/stack.js';

test('every entry gets its own key', () => {
  assert.notEqual(entry('home').key, entry('home').key);
});
test('push adds on top and keeps earlier entries (same objects)', () => {
  const a = resetTo('records');
  const b = push(a, 'record', { id: 'o1' });
  assert.equal(b.length, 2);
  assert.equal(b[0], a[0]);
  assert.deepEqual(b[1].params, { id: 'o1' });
});
test('replaceTop keeps the key for the same screen, changes it for another', () => {
  const a = resetTo('plants');
  const same = replaceTop(a, 'plants', { view: 'tagged' });
  assert.equal(same[0].key, a[0].key);
  assert.deepEqual(same[0].params, { view: 'tagged' });
  assert.notEqual(replaceTop(a, 'tag', { qr: 'NIAH-0001' })[0].key, a[0].key);
});
test('pop removes the top, never the last entry', () => {
  const one = resetTo('home');
  assert.equal(pop(one), one);
  assert.equal(pop(push(one, 'about')).length, 1);
});
test('resetTo drops everything (sign-out, role change, tab switch)', () => {
  const deep = push(push(resetTo('review'), 'reviewItem'), 'tag');
  const fresh = resetTo('home');
  assert.equal(fresh.length, 1);
  assert.ok(!deep.some((e) => e.key === fresh[0].key));
});
test('only the newest KEEP_MOUNTED entries stay mounted', () => {
  let s = resetTo('home');
  for (let i = 0; i < 8; i += 1) s = push(s, 'species', { id: i });
  const kept = mountedEntries(s);
  assert.equal(KEEP_MOUNTED, 5);
  assert.equal(kept.length, 5);
  assert.equal(kept[4], s[s.length - 1]);
  assert.equal(mountedEntries(resetTo('home')).length, 1);
});
```

- [ ] **Step 2:** Run `node --test tests/navigation-stack.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `stack.js` to the Interfaces above.
- [ ] **Step 4:** Run the test. Expected: 6 pass.
- [ ] **Step 5:** `git add apps/mobile/navigation/stack.js apps/mobile/tests/navigation-stack.test.mjs`

---

### Task 2: Keep-alive navigator and focus

**Files:**
- Create: `apps/mobile/navigation/focus.js`
- Create: `apps/mobile/hooks/useReduceMotion.js`
- Modify: `apps/mobile/navigation/useAppNavigation.js`
- Modify: `apps/mobile/navigation/AppNavigator.js`

**Interfaces:**
- Consumes: Task 1's `resetTo, push, replaceTop, pop, mountedEntries`.
- Produces:
  - `focus.js`: `FocusContext` (React context, default `true`), `useIsFocused()` → boolean, `useBackHandler(handler, enabled = true)`: registers a `hardwareBackPress` listener only while the screen is focused and `enabled`; `handler` returns `true` when it handled the press. The newest handler is kept in a ref so the listener is not re-registered on every render.
  - `useReduceMotion()` → boolean, from `AccessibilityInfo.isReduceMotionEnabled()` plus its `reduceMotionChanged` listener.
  - `useAppNavigation(role)` keeps returning `{ stack, route, nav, currentTab, first }`; `nav` keeps `go, replace, back, tab, home, canGoBack`.

- [ ] **Step 1: `useAppNavigation.js`.** Hold the stack with Task 1's functions (`go`→`push`, `replace`→`replaceTop`, `back`→`pop`, `tab`/`home`/role change→`resetTo`). Call `Keyboard.dismiss()` in `go`, `replace`, `back`, `tab` and `home`. Register the hardware-back listener **once** (empty dependency list) reading the stack length from a ref: React runs a child's effects before its parent's, so a listener re-registered here on every push would end up newer than a screen's own listener and win; registered once at start-up, any screen's `useBackHandler` takes priority.
- [ ] **Step 2: `AppNavigator.js`.** Render `mountedEntries(stack)` instead of only the top screen. Each entry gets a wrapper keyed by `entry.key`:
  - outer `View`: `StyleSheet.absoluteFill`, `overflow: 'hidden'`, `pointerEvents` `'auto'` when focused else `'none'`, `collapsable={false}`, `removeClippedSubviews` when hidden, and when hidden `importantForAccessibility="no-hide-descendants"` plus `accessibilityElementsHidden`;
  - inner `View`: `flex: 1`, plus `top: 30000` when hidden (the screen is moved off screen rather than `display: 'none'`, so lists keep their layout and scroll position);
  - `FocusContext.Provider value={focused}` around the screen.
  The permission check (`canAccess`) runs per entry with that entry's name. Keyboard padding, the camera background and `showTabs` keep using the top route.
- [ ] **Step 3: Fade.** Replace `FadeScreen`'s mount-only fade: the wrapper fades opacity 0→1 over 180 ms each time it **becomes** focused, and sets opacity to 1 at once when `useReduceMotion()` is true.
- [ ] **Step 4:** Run the bundle check. Expected: exits 0.
- [ ] **Step 5:** `git add apps/mobile/navigation apps/mobile/hooks/useReduceMotion.js`

---

### Task 3: Hidden screens go quiet

**Files:**
- Modify: `apps/mobile/hooks/usePolling.js`
- Modify: `apps/mobile/pages/MapPage.js`
- Modify: `apps/mobile/pages/Scan.js`
- Modify: `apps/mobile/pages/Records.js` (the drafts effect in `MyRecords`)
- Modify: `apps/mobile/pages/TagQr.js`

**Interfaces:**
- Consumes: `useIsFocused`, `useBackHandler` from Task 2.

- [ ] **Step 1: `usePolling`.** Poll only while `enabled && useIsFocused()`; add the focus value to the effect's dependencies, so a screen polls once the moment it is shown again.
- [ ] **Step 2: `MapPage`.** One `startWatch()` used by both the mount effect and `handleLocateMe` after permission is granted. The effect depends on focus: it starts the watch when focused and removes it when hidden or unmounted. Use a `cancelled` flag so a subscription that resolves after cleanup is removed at once (today it leaks).
- [ ] **Step 3: `MapPage` locate.** Permission denied → `notify('Location is off for this app. Turn it on in the phone settings to see where you are.')`. Wrap `getCurrentPositionAsync` in a 15 000 ms race; on timeout or error → `notify("Couldn't get your location. Try again in the open.")`. Always clear `locating` in `finally`.
- [ ] **Step 4: `Scan`.** Mount `CameraView` only when `granted && !result && focused`.
- [ ] **Step 5: `MyRecords`.** Add the focus value to the `listDraftsFor` effect's dependencies, so drafts changed by Add plant are re-read on return.
- [ ] **Step 6: `TagQrView`.** Replace its own `BackHandler` effect with `useBackHandler(() => { onBack(); return true; })`. Update the file's header comment: the navigator no longer unmounts covered screens, but Add plant still shows the QR in place.
- [ ] **Step 7:** Run the bundle check and the unit tests. Expected: bundle exits 0; tests unchanged from Task 0.
- [ ] **Step 8:** `git add` the five files.

---

### Task 4: Offline strip and honest empty states

**Files:**
- Create: `apps/mobile/components/listState.js`
- Create: `apps/mobile/components/OfflineStrip.js`
- Test: `apps/mobile/tests/list-state.test.mjs`
- Modify: `apps/mobile/components/bits/loading.js`, `apps/mobile/navigation/AppNavigator.js`
- Modify (swap list-empty `<Empty>` for `<EmptyState>`): `pages/Public.js` (Home recent), `pages/Dashboard.js` (both lists), `pages/Records.js` (MyRecords), `pages/Review.js` (queue), `pages/Notifications.js`, `pages/Monitoring.js` (readings), `pages/Admin.js` (Users, Audit), `pages/Tags.js`, `pages/Species.js`, `pages/Discussion.js` (Threads)

**Interfaces:**
- Produces:
  - `emptyKind(count, apiStatus, filtered = false)` → `'none' | 'loading' | 'offline' | 'empty'` (pure). `count > 0` → `'none'`. `filtered` (a search or filter is active) → `'empty'`. Otherwise `'checking'` → `'loading'`, `'offline'` → `'offline'`, anything else → `'empty'`.
  - `OFFLINE_EMPTY = 'No connection, and nothing is saved on this phone to show here yet.'`
  - `<EmptyState count icon filtered rows={4}>text</EmptyState>` in `bits/loading.js`: reads `apiStatus` from the store; renders nothing, `rows` × `SkeletonRow`, `<Empty icon="info">{OFFLINE_EMPTY}</Empty>`, or `<Empty icon={icon}>{children}</Empty>`.
  - `<OfflineStrip />`: renders only while `apiStatus === 'offline'`. One row, 32 high, `c.neutralSoft` background, top border `c.line`, `info` icon 14 in `c.ink2`, caption text `Offline. Showing what is saved on this phone.`, `accessibilityLiveRegion="polite"`. Exports `OFFLINE_STRIP_HEIGHT = 32`.

- [ ] **Step 1: Write the failing test** `list-state.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyKind } from '../components/listState.js';

test('a list with rows never shows an empty state', () => {
  for (const s of ['checking', 'connected', 'offline']) assert.equal(emptyKind(3, s), 'none');
});
test('no rows while the API has not answered yet is loading, not empty', () => {
  assert.equal(emptyKind(0, 'checking'), 'loading');
});
test('no rows with no connection says so', () => {
  assert.equal(emptyKind(0, 'offline'), 'offline');
});
test('no rows once connected is really empty', () => {
  assert.equal(emptyKind(0, 'connected'), 'empty');
});
test('a search or filter with no match is "no match", whatever the connection', () => {
  for (const s of ['checking', 'connected', 'offline']) assert.equal(emptyKind(0, s, true), 'empty');
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `listState.js` (no React Native imports), then `EmptyState` and `OfflineStrip`.
- [ ] **Step 4:** Run the test. Expected: 5 pass.
- [ ] **Step 5:** In `AppNavigator`, render `<OfflineStrip />` directly above `TabBar` (only when the tab bar is shown), and raise the toast's `bottom` by `OFFLINE_STRIP_HEIGHT` while it shows.
- [ ] **Step 6:** Swap each list-empty `<Empty>` listed above for `<EmptyState count={…} icon={…} filtered={…}>`, keeping its current words. `filtered` is true when that screen's search text is non-empty or a non-default filter is picked. "Not found" messages on detail screens ("This record no longer exists.") stay plain `<Empty>`.
- [ ] **Step 7:** Run the bundle check. Expected: exits 0.
- [ ] **Step 8:** `git add` the files above.

---

### Task 5: Monitoring fixes

**Files:**
- Modify: `apps/shared/StoreProvider.js` (`ackAlert`, `resolveAlert`, `addAlertNote`, `addComment`)
- Modify: `apps/mobile/pages/Monitoring.js`

**Interfaces:**
- Produces: `ackAlert`, `resolveAlert`, `addAlertNote` and `addComment` resolve to `true` on success and `false` on failure (today: `undefined` either way). Additive: the web app ignores the value. `addComment` is used by Task 6.

- [ ] **Step 1:** Grep `apps/web/src` for the four names and confirm no caller depends on the return value. Then change each function: `notify(…failure…); return false;` and `return true` at the end. An empty note or comment returns `false`.
- [ ] **Step 2: `Monitor`.** The selected node is `picked ?? firstActive ?? first`, computed on every render (today it is frozen at mount, so nodes that load later never show a chart). Read limits as `node?.thresholds?.temp_max`; when there is no limit, leave out the "limit …" text, the red colouring and the chart's limit line.
- [ ] **Step 3: `AlertCard` and `AlertDetail`.** Severity label comes from `statusText(a.severity || 'unknown')` (no `charAt` on a missing value).
- [ ] **Step 4: `AlertDetail`.** `ack` and `resolve` become async with a `busy` state: save the note (if any), await the action, and call `nav.back()` only when it returned `true`. Remove this screen's own `notify('Alert acknowledged')` / `notify('Alert resolved')` (the store already says it, and today the screen says it even on failure). Both footer buttons are disabled while busy.
- [ ] **Step 5:** Run `node --test` in `apps/shared` and the bundle check. Expected: shared tests pass; bundle exits 0.
- [ ] **Step 6:** `git add apps/shared/StoreProvider.js apps/mobile/pages/Monitoring.js`

---

### Task 6: Discussion, returned record, review, invite

**Files:**
- Modify: `apps/mobile/components/bits/layout.js` (`Screen`)
- Modify: `apps/mobile/pages/Discussion.js`, `apps/mobile/pages/Records.js`, `apps/mobile/pages/Review.js`, `apps/mobile/pages/Admin.js`

**Interfaces:**
- Consumes: `addComment` → boolean (Task 5).
- Produces: `Screen` accepts `stickToEnd` (boolean): its scroll view scrolls to the end on first layout and whenever its content grows.

- [ ] **Step 1: `Thread`.** `send` awaits `addComment`; the box is cleared only on `true`, and the send button shows a disabled state while sending. Pass `stickToEnd` to its `Screen` so a thread opens at the newest message. Reply input gets `returnKeyType="send"`.
- [ ] **Step 2: `Threads`.** `${count} message${count === 1 ? '' : 's'}`.
- [ ] **Step 3: `RecordDetail` returned form.** Same rules as the edit form: `maxLength={LIMITS.text}` on both areas, the height field shows `HEIGHT_PROBLEM` when `!heightOk(...)`, and `send` stops with the same "Height not valid" alert.
- [ ] **Step 4: `RecordDetail` returned wording.** Remove the dashed camera box (it looks tappable and is not). Replace the last line with: `Photos can't be changed on a returned record. To add one, use "Record a revisit" on the plant's page.`
- [ ] **Step 5: `ReviewRecord`.** Seed `spText` once, the first time `plant` exists (the pattern `RecordDetail` uses for `fix`), so a record that loads after the screen opens still fills "Confirm species".
- [ ] **Step 6: `Users` invite.** Add a `sending` state: `invite` returns early while sending, the submit button is disabled and reads `Sending…` (or `Creating…` with a password). Show the name problem under "Full name" and the email problem under "Email" instead of one combined message under Email.
- [ ] **Step 7:** Run the bundle check. Expected: exits 0.
- [ ] **Step 8:** `git add` the five files.

---

### Task 7: Remember the theme

**Files:**
- Modify: `apps/mobile/components/Theme.js`

- [ ] **Step 1:** `ThemeProvider` reads AsyncStorage key `daun.themeMode` on mount and renders `null` until it has an answer (the splash screen is still up, as it is for fonts). An unreadable or unknown value means `'device'`.
- [ ] **Step 2:** `setMode` saves the new mode to the same key; a failed write is ignored (the theme still changes for this session).
- [ ] **Step 3:** Run the bundle check. Expected: exits 0.
- [ ] **Step 4:** `git add apps/mobile/components/Theme.js`

---

### Task 8: Lists

**Files:**
- Create: `apps/mobile/hooks/useShowMore.js`
- Modify: `apps/mobile/pages/Dashboard.js`, `apps/mobile/pages/Public.js`, `apps/mobile/components/bits/inputs.js` (`SearchField`), `apps/mobile/pages/Tags.js`, `apps/mobile/pages/Admin.js` (Audit), `apps/mobile/pages/Species.js`

**Interfaces:**
- Produces:
  - `SearchField` accepts `onSubmitEditing` and `autoFocus`.
  - `useShowMore(items, resetKey, step = 30)` → `{ shown, left, showMore }`: the first `step` items, `left` = how many are not shown, `showMore()` adds `step`; a new `resetKey` starts again.

- [ ] **Step 1: `usePaged`.** Remove the 450 ms timer: the first page shows at once, a new search/filter/sort shows its first page at once, and `loadMore` adds a page at once. `loading` is always `false` for these in-memory lists (the API search keeps its own real loading state).
- [ ] **Step 2: Home search.** Typing no longer navigates. `onSubmitEditing` opens `plants` with `{ q: q.trim() }` when the text is not empty.
- [ ] **Step 3: Long lists.** Tags, Audit and Species admin render `useShowMore(...).shown` with a text button below: `Show more (${left} left)`, 48 high. `resetKey` is the search text plus the filter and sort.
- [ ] **Step 4:** Run the bundle check and unit tests. Expected: bundle exits 0; tests unchanged.
- [ ] **Step 5:** `git add` the files above.

---

### Task 9: Forms

**Files:**
- Modify: `apps/mobile/components/bits/inputs.js` (`Field`), `apps/mobile/pages/Login.js`, `apps/mobile/pages/AddPlant.js` (`PhotoStrip`), `apps/mobile/pages/Reports.js`

**Interfaces:**
- Produces: `Field` passes through `autoComplete`, `returnKeyType`, `onSubmitEditing`, `autoFocus`, `inputRef`, and takes `rightLabel` (the accessibility label of the right icon; falls back to `label`). Email fields get `autoCorrect={false}`.

- [ ] **Step 1: Sign in.** Email: `autoComplete="email"`, `returnKeyType="next"`, enter moves to the password. Password: `autoComplete="current-password"`, `returnKeyType="go"`, enter submits; `rightLabel` is `Show password` / `Hide password`. Code fields: `autoFocus`, `autoComplete="one-time-code"`, enter submits when 6 digits are in. Wrap each submit in `try/finally` so `busy` always clears, and keep `busy` true across sign-in and `mfaEnroll` (no flicker).
- [ ] **Step 2: Photo removal.** Each thumbnail in `PhotoStrip` gets a visible round remove button at its top-right corner: 24 across, `c.surface` background, `c.line` border, `x` icon 14 in `c.ink`, `hitSlop` 12, label `Remove photo ${i + 1}`. Long-press still works; the thumbnail's label drops "Hold to remove."
- [ ] **Step 3: Reports.** The plants of a tapped bar render directly under that bar (inside `Bars`), not in a section at the bottom of the page. The hint reads `Tap a bar to list its plants.` Tapping the bar again closes it; remove the separate "Close" button.
- [ ] **Step 4:** Run the bundle check. Expected: exits 0.
- [ ] **Step 5:** `git add` the four files.

---

### Task 10: Confirmations

**Files:**
- Modify: `apps/mobile/pages/Admin.js`, `apps/mobile/pages/AddPlant.js`, `apps/mobile/pages/Review.js`

**Interfaces:**
- Consumes: `useBackHandler` (Task 2).

- [ ] **Step 1: Role change (`Users`).** Tapping a different role asks first. Title `Change ${name} to ${ROLE_LABEL[role]}?`, body `Their access changes straight away.`, buttons `Cancel` / `Change role`. Tapping the current role does nothing.
- [ ] **Step 2: Revisit close.** With a photo, text or height entered, the X asks: title `Discard this revisit?`, body `What you entered will be lost.`, buttons `Keep editing` / `Discard` (destructive). With nothing entered it closes at once.
- [ ] **Step 3: Android back.** On the Add plant form (the step after a tag is chosen) and on Revisit, `useBackHandler` runs the same `leave` as the X button and returns `true`. It is enabled only while the QR view is not showing (that view has its own back handler).
- [ ] **Step 4: Reject (`ReviewRecord`).** After the note check, reject asks: title `Reject ${plant.qr_id}?`, body `The botanist is told, with your note.`, buttons `Cancel` / `Reject` (destructive). Approve and Return are unchanged.
- [ ] **Step 5: Sign out (`StaffMore`).** When there are no unsent records and no drafts, ask: title `Sign out?`, body `You'll need your password and 6-digit code to sign in again.`, buttons `Cancel` / `Sign out`. When the unsent-records or drafts prompt already appears, do not add a second prompt.
- [ ] **Step 6:** Run the bundle check and unit tests (`security-fixes.test.mjs` covers sign-out draft clearing). Expected: bundle exits 0; tests unchanged.
- [ ] **Step 7:** `git add` the three files.

---

### Task 11: UI kit polish

**Files:**
- Modify: `apps/mobile/components/bits/inputs.js`, `apps/mobile/components/bits/buttons.js`, `apps/mobile/components/Icon.js`, `apps/mobile/components/Toast.js`, `apps/mobile/navigation/TabBar.js`, `apps/mobile/navigation/tabs.js`, `apps/mobile/navigation/AppNavigator.js`
- Modify: `apps/mobile/pages/Scan.js`, `apps/mobile/pages/Monitoring.js`, `apps/mobile/pages/Book.js`, `apps/mobile/pages/Discussion.js`, `apps/mobile/pages/AddPlant.js`, `apps/mobile/pages/PlantPage.js`, `apps/mobile/pages/Review.js`, `apps/mobile/pages/Records.js`, `apps/mobile/pages/Dashboard.js`, `apps/mobile/components/SpeciesPicker.js`
- Test: `apps/mobile/tests/tabs.test.mjs`

**Interfaces:**
- Produces: `badgeText(count)` in `tabs.js` → `''` for 0 or less, the number as text up to 99, `'99+'` above.

- [ ] **Step 1: Write the failing test** `tabs.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeText, getRoleTabs } from '../navigation/tabs.js';

test('badge text is capped at 99+', () => {
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(99), '99');
  assert.equal(badgeText(100), '99+');
});
test('only botanists see "Add plant"; officers and admins cannot add plants', () => {
  const main = (role) => getRoleTabs(role).find((t) => t.main).label;
  assert.equal(main('botanist'), 'Add plant');
  assert.equal(main('officer'), 'Scan');
  assert.equal(main('admin'), 'Scan');
  assert.equal(main('visitor'), 'Scan');
});
```

- [ ] **Step 2:** Run it. Expected: FAIL (`badgeText` missing; officer label is "Add plant").
- [ ] **Step 3: Tabs.** Add `badgeText`; officer and admin centre tab label becomes `Scan`. `TabBar` shows `badgeText(count)`, and each tab's `Pressable` fills the bar's height (content stays bottom-aligned) with pressed feedback.
- [ ] **Step 4:** Run the test. Expected: 2 pass. `agent-mobile-role-pages.test.mjs` already accepts either label.
- [ ] **Step 5: Press feedback** (the Global Constraints pattern) on: `Pills`, `Segmented`, `SortBar`, `Check`, the three pill buttons on Scan, `AlertCard`, Book rows, the plant card at the top of a thread, the unused-tag chips in Add plant, the hero's round back button, Review's species suggestions.
- [ ] **Step 6: Touch targets.** `SortBar` chips: 32 high with `hitSlop={{ top: 8, bottom: 8 }}`. `Pills`: `hitSlop={{ top: 6, bottom: 6 }}`. Every `Button` passed `height` 40, 42 or 44 becomes 48.
- [ ] **Step 7: Toast.** Fades and rises 8 px into place over 200 ms (instant with reduce motion), has `accessibilityRole="alert"`, and a tap dismisses it. `AppNavigator` passes `onDismiss={() => notify('')}`.
- [ ] **Step 8: Icons and colours.** Add `image` (Lucide `Image`) to `Icon.js` and use it on Scan's "From gallery", Add plant's "From gallery" and "Choose QR from gallery". In `Scan.js` replace the hard-coded hex values with `palettes.dark.ink`, `palettes.dark.ink2`, `palettes.dark.accent`, `palettes.dark.warning` and `c.camera` (the camera screen is dark in both themes).
- [ ] **Step 9:** Run the bundle check and unit tests. Expected: bundle exits 0; only the known `zoomToShowLayer` failure.
- [ ] **Step 10:** `git add` the files above.

---

### Task 12: Copy pass

**Files:**
- Modify: `apps/mobile/pages/AddPlant.js`, `apps/mobile/pages/Login.js`, `apps/mobile/pages/MapPage.js`, `apps/mobile/pages/PlantPage.js`, `apps/mobile/pages/Public.js`

- [ ] **Step 1:** Grep `apps/mobile/tests` for each "from" string below; update any test that asserts it.
- [ ] **Step 2:** Apply exactly:

| From | To |
|---|---|
| `Tag Generation Failed` / `Could not generate QR tag.` | `Couldn't make a tag` / `Try again in a moment.` |
| `Tag Already In Use` (both) | `Tag already in use` |
| `Record Revisit` (both alert buttons) | `Record a revisit` |
| Alert `QR Tag Bound` / `Loaded tag: X` | Toast: `Tag X selected` (no alert) |
| `No QR Code Detected` | `No QR code found` |
| `Gallery Error` | `Couldn't open the photo` |
| `Submission Error` | `Couldn't submit` |
| `Generating QR tag...` | `Making a tag…` |
| `Submitting...` | `Submitting…` |
| `Restored in-progress draft from previous session` | `Draft restored from your last session` |
| `Signing in...`, `Checking...` (both) | `Signing in…`, `Checking…` |
| `Locating...` | `Locating…` |
| `Review record (Action needed)` | `Review this record` |
| `Review decisions` | `See the decision` |

- [ ] **Step 3:** In `Public.js` remove the stray `fontWeight: undefined`.
- [ ] **Step 4:** Run `grep -rn "\.\.\.'" pages components` and `grep -rn '\.\.\."' pages components`. Expected: no user-facing string still ends in three dots (spread syntax in code is fine).
- [ ] **Step 5:** Run the bundle check and unit tests. Expected: as before.
- [ ] **Step 6:** `git add` the five files.

---

### Task 13: Dead code

**Files:**
- Delete: `apps/mobile/components/PhotoGallery.js` (imports a `COLORS` export that does not exist; nothing imports the file; it uses emoji)
- Modify: `apps/mobile/components/bits/charts.js` (remove `MiniMap` and its mention in the header comment), `apps/mobile/pages/PlantPage.js` (remove the `MiniMap` import; remove `mapPoint` and `dots` if nothing else uses them, replacing `dots.length` with the count of plants that have shown coordinates), `apps/mobile/pages/AddPlant.js` (remove `promptChoice`), `apps/mobile/pages/Public.js` (remove the unused `fuzzyMatch` import), `apps/mobile/pages/Admin.js` (remove Audit's unused `sort` state and now-unused imports), `apps/mobile/pages/Species.js` (remove the bare `useTheme()` call)

- [ ] **Step 1:** For each name, grep `apps/mobile` (excluding `node_modules`) and `apps/web` to confirm nothing uses it, tests included. Keep anything a test imports.
- [ ] **Step 2:** `git rm apps/mobile/components/PhotoGallery.js`, then make the edits above.
- [ ] **Step 3:** Run the bundle check and unit tests. Expected: bundle exits 0 (a missed import would fail here); tests as before.
- [ ] **Step 4:** `git add` the modified files.

---

### Task 14: Final verification and hand-over

- [ ] **Step 1:** Run all three verification commands. Expected: unit tests show only the known `zoomToShowLayer` failure; shared tests pass; the bundle check exits 0.
- [ ] **Step 2:** `git status --short` and `git diff --cached --stat`. Expected: every change from this plan is staged, nothing is committed, the branch is still `main`, and the owner's untracked `docs/superpowers/plans/2026-10-29-…` file is untouched.
- [ ] **Step 3:** Give the owner this phone checklist (it cannot be run on the development machine):
  1. Plants: scroll down, search, open a species, go back. Scroll position and search are still there.
  2. Go six screens deep (species → plant → map → plant → species → plant) and press back to the start. No crash, no wrong screen.
  3. Type in a search box, then open a row. The keyboard closes and the next screen is full height.
  4. Open the map, grant location, leave the map. The location icon in the status bar goes away within a few seconds.
  5. Start a revisit, add a photo, press Android back. "Discard this revisit?" appears. Do the same on Add plant.
  6. Open a plant page from the map, press back. The map is where you left it, with the same zoom.
  7. Turn on airplane mode. The offline strip appears above the tab bar within a few polls; lists keep their data.
  8. Force-close, reopen in airplane mode as staff. Lists show skeletons, then the offline message, never "No records yet".
  9. Set Dark theme, force-close, reopen. It is still dark.
  10. Sign in: the keyboard's next/go keys work, the 6-digit field is focused, the eye button toggles.
  11. Users: tap another role. A confirmation appears. Sign out with nothing unsent: a confirmation appears.
  12. Officer: reject a record. A confirmation appears after the note is typed.
  13. Reports: tap a bar. Its plants appear directly under it.
  14. Discussion: open a long thread. It opens at the newest message; a reply sent in airplane mode stays in the box.
  15. Scan a tag after visiting other screens: the camera starts, and stops when you leave.
- [ ] **Step 4:** Report to the owner: what was done, the one known failing test (`zoomToShowLayer`, a shared-code question), that `apps/mobile/AGENTS.md` still names Expo v57 while the app is on 58, and that switching tabs still resets a tab's screen (out of scope here).

## Out of scope

- Keeping each tab's screen alive across tab switches (needs one stack per tab).
- Haptic feedback on scan (would need a new permission).
- Offline map tiles.
- The web app, the API and the firmware.
