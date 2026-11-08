# Offline mode: airplane-mode test script

Stories covered: CTIP-44 (local record store), CTIP-83 (airplane-mode capture), CTIP-84 (offline species search), CTIP-16 (sync queue), CTIP-66 (resumable photo upload), CTIP-67 (conflict handling), CTIP-68 (sync status), CTIP-116 (offline QR tag).

The automated tests (`npm test` in `services/api`, `node --test` in `apps/shared`) cover the rules. This script covers what they cannot: the real release APK, a real phone, a real airplane-mode switch and a real second phone. A story moves to Done in Jira only when every row that belongs to it below says Pass.

Design reference: `docs/architecture/offline-sync.md`.

## Before you start

1. **Release APK.** Build it with `npm run mobile:build:apk` from the repository root (this is an EAS account step). Install it on an Android phone. Do not use Expo Go: it has no SQLCipher, so the local database is not encrypted there (case 8 would fail for that reason alone).
2. **API with `POST /sync`.** The release APK talks to the Render API by default. The offline branch adds `POST /sync`, the reserved-tag rules and the botanist "Release" route to the API. Until that API code is deployed (merged to `main` so Render redeploys), sending answers 501 and cases 1 to 6 will fail for that reason. Check before starting: signed in as a botanist with the phone online, save one plant. It must send.
3. **Migration.** `supabase/migrations/20261108000000_qr_tags_botanist_release_reserved.sql` must be pushed to the live database (the user pushes it, after telling Amberlyn). Until then, "Release" on a kept tag answers "not found" (case 6, row 6k).
4. **Accounts and phones.** One botanist account with a confirmed email and an authenticator app. A second botanist account for cases 5 and 6o. For case 6 (conflict), two Android phones both signed in as the same botanist. For case 6 and case 2, an officer or admin account to look at the website.
5. **Other things you need.** A laptop with `adb` (Android platform tools) and USB debugging turned on, for cases 8a and 8b. A few pre-printed tags (`NIAH-####`) that are still unused. A plant (any species) already approved on the live system, for the revisit in case 1.
6. **This repository is public.** Any screenshot you add to this file must have names, emails, tag IDs of real plants, locations and any codes blurred, and must never show a password, key or token. When in doubt, leave the screenshot out and write what you saw.

## How to read the words

Status words on the phone: "Waiting to sync" (queued), "Sending", "Couldn't send" (failed), "Changed on another device" (conflict). Records saved on the phone are listed in My records under the heading "On this phone", above a bar that reads "{n} waiting to sync" and has a "Sync now" button.

To switch airplane mode, use the phone's quick settings. Wi-Fi must also be off (some phones turn Wi-Fi back on by themselves). The app's own banner "You're offline. New records are saved on this phone." appears at the top of My records and Add plant when the phone cannot reach the server; it can take a few seconds to show.

## Case 1: capture in airplane mode (CTIP-83, CTIP-44, CTIP-68)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 1a | Sign in as the botanist online and wait for My records to load. Turn on airplane mode (and Wi-Fi off). Open Add plant. Pick or scan an unused pre-printed tag. Choose a species (or type a name), set height and appearance, take 2 photos, let GPS fix, tap submit. | The offline banner shows on Add plant. The tag is accepted with no connection. The saved screen reads "Saved on this phone" with the label "Waiting to sync" and the text "No connection right now. It will be sent for review automatically when you're back online." Buttons: "Record another plant" and "See records on this phone". | | | | |
| 1b | Tap "See records on this phone". | My records shows the group "On this phone" with the new plant, its tag, and "Waiting to sync". The bar reads "1 waiting to sync". The My records tab badge does not count it as a problem. | | | | |
| 1c | Still in airplane mode, use "Record another plant" and save a second new plant the same way. | The bar reads "2 waiting to sync". Both are listed. | | | | |
| 1d | Still in airplane mode, scan or open a tag that is already on an approved plant and choose "Record a revisit". Add 1 photo and submit. | The revisit saves with "Saved on this phone" and "Waiting to sync". The bar reads "3 waiting to sync". | | | | |
| 1e | Still in airplane mode, tap "Sync now". | The toast reads "Still offline. They'll send when you're back online." Nothing is lost. | | | | |
| 1f | Turn airplane mode off (Wi-Fi or mobile data on). Do not tap anything. Wait up to a minute. | The records go from "Waiting to sync" to "Sending" and leave "On this phone" by themselves. The bar disappears. The records show in My records as "Needs review". | | | | |
| 1g | On the website, signed in as an officer, open the review queue and each of the three plants. | Each plant exists exactly once, with the right tag, all photos, the GPS spot and the revisit attached to the existing plant. No duplicates. | | | | |

## Case 2: airplane mode turned on during the upload (CTIP-16, CTIP-66)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 2a | Online, save a new plant with 5 photos (large ones from the camera). While the record shows "Sending", turn airplane mode on at once. Wait 10 seconds. | The record goes back to "Waiting to sync" (or stays "Sending" for a moment, then returns). It is never deleted and never shows an error that loses it. | | | | |
| 2b | Turn airplane mode off. Wait up to a minute without tapping. | The record sends. The photos that already arrived are not sent again. | | | | |
| 2c | On the website, open the plant. | Exactly one plant, each of the 5 photos exactly once (5 photos, not 6 to 10). | | | | |
| 2d | Repeat 2a and 2b once more, this time switching airplane mode on a second later, then off, then on, then off (a flaky connection). | The record still ends up on the website once, with every photo once. | | | | |

## Case 3: app killed while sending (CTIP-16, CTIP-44)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 3a | Airplane mode on. Save a new plant with 5 photos. Turn airplane mode off and watch for "Sending". As soon as it shows, open recent apps and swipe the app away. | The app closes. | | | | |
| 3b | Reopen the app, sign in if it asks. Wait up to a minute without tapping. | The record is still in "On this phone" (or already sent). It sends on its own. | | | | |
| 3c | On the website, open the plant. | One plant, every photo once. No half-created plant and no duplicate. | | | | |

## Case 4: a new APK installed over unsent records (CTIP-44)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 4a | Airplane mode on. With the old release APK installed, save 2 new plants. Do not send them. | "2 waiting to sync". | | | | |
| 4b | With airplane mode still on, install a newer APK over the old one (same signing key, so it updates in place, not uninstall and reinstall). Open the app and sign in as the same botanist. | The app opens. My records still lists both plants under "On this phone" with their photos. | | | | |
| 4c | Turn airplane mode off and wait up to a minute. | Both records send. The website shows each plant once. | | | | |

If you have only one APK build, build a second one (any small change, or the same code with a new commit) before running this case. Uninstalling first is not the test: that deletes the data on purpose.

## Case 5: sign-out and another botanist on the same phone (CTIP-68, CTIP-44)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 5a | Airplane mode on. As botanist A, save 1 plant. Open More and tap "Sign out". | An alert titled "1 record not sent yet" with the text "They stay on this phone, encrypted, and send the next time you sign in here. Sign out anyway?" Buttons: "Stay signed in" and "Sign out" (no "Send now" while offline). | | | | |
| 5b | Tap "Stay signed in". | Nothing changes. The record is still there. | | | | |
| 5c | Tap "Sign out" and confirm. Turn airplane mode off. Sign in as botanist B. Open My records. | B does not see A's plant under "On this phone" and the bar does not count it. The record does not send while B is signed in. | | | | |
| 5d | Sign out as B. Sign in as botanist A again. | A's plant is under "On this phone" again and sends within a minute. The website shows it once, under A's name. | | | | |
| 5e | With the phone online, save a plant while the connection is poor, so it stays unsent, then sign out. | The alert also offers "Send now". Tapping it sends what it can, then asks again if something is left, or signs out if nothing is left. | | | | |

## Case 6: two-phone conflict (CTIP-67) and making a tag offline (CTIP-116)

### Part A: two phones, same botanist account

Use a record that the app lets you edit: one in "Draft" status (it shows "Edit record" and "Send for review" on its page, under "Needs you" in My records). Both phones are signed in as the same botanist and both must show the record. If you cannot get a Draft record, tell Dino before running this part.

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 6a | Phone A and phone B both open the same draft record. On phone A, online: open "Edit record", set Height to 40, tap "Save changes". | Toast "Changes saved". | | | | |
| 6b | Phone B, airplane mode on: edit the same record, set Height to 50, tap "Save changes". | Toast "Saved on this phone. It sends when you're back online." (or similar). The record appears under "On this phone". The server copy is hidden from the main list while it waits. | | | | |
| 6c | Phone B: turn airplane mode off, tap "Sync now". | The record turns "Changed on another device". Open it: a warning reads "This record was changed on another device before this phone sent its changes. Choose which version to keep." A table with columns "Field", "This phone" and "Other device" shows Height: "50 cm" against "40 cm". Buttons: "Keep this phone's version" (main) and "Keep the other version". | | | | |
| 6d | Phone B: leave it alone for a minute (poll and sync again). | It stays in conflict. Nothing is sent and nothing is lost without a choice. | | | | |
| 6e | Phone B: tap "Keep this phone's version". | Toast "Kept this phone's version". The record leaves "On this phone". The website and phone A show Height 50 cm. The record's comments contain "Edited on two devices before syncing. Kept the version from this phone." exactly once. | | | | |
| 6f | Repeat 6a to 6c with new values (A sets 60, B sets 70). Then on phone B tap "Keep the other version". | Toast "Kept the other device's version". B's edit is gone. Height stays 60 cm. The comment reads "Edited on two devices before syncing. Kept the version from the other device." | | | | |
| 6g | Repeat 6a to 6c again, then turn airplane mode on at phone B and tap "Keep this phone's version". Then try the same again on another conflict with "Keep the other version". | "Keep this phone's version" still toasts "Kept this phone's version" and the edit and comment go out when the phone is back online. "Keep the other version" shows "Couldn't keep the other version: ..." and the record stays in conflict. | | | | |
| 6h | Stale form check. Phone A opens a draft record. Phone B (online) changes Height and saves. On phone A, without leaving the form, change only Notes and tap "Save changes". | Phone A shows the message "This record changed since you opened it. Refresh and try again." and saves nothing. Phone B's Height is still there. | | | | |

### Part B: kept tags (making a tag with no connection)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 6i | Sign in as the botanist, online, and open Add plant (the first screen, before a tag is chosen). Wait for the workspace to load. | A section "Kept for offline use" shows 3 tags, with the text "These tags are kept for you, so you can make a new tag with no connection." Each tag has a "Release" link. | | | | |
| 6j | Airplane mode on. Close the app completely and reopen it. Open Add plant. | The 3 kept tags are still listed. "Release" is not shown while offline. | | | | |
| 6k | Online, tap "Release" on one tag. | The tag is released and a fresh kept tag takes its place, so the list still has 3. If the migration is not pushed yet, the app shows an error such as "not found": note that in Actual and mark the row Blocked, not Fail. | | | | |
| 6l | Airplane mode on. Tap "Generate new QR tag". Complete a full record and submit. | An alert "New tag ready" shows a kept tag. The record saves as "Waiting to sync". The tag leaves the "Kept for offline use" list. | | | | |
| 6m | Use all 3 kept tags offline (3 records). Then try "Generate new QR tag" again, and the "New tag" link on a form. | The button is disabled with the hint "No offline tags left. Connect to the internet to get more, or scan a pre-printed tag." The "New tag" link shows an alert "No offline tags left". | | | | |
| 6n | Airplane mode off. Wait for the records to send. Open Add plant. | The 3 records send once each, with their kept tags, and each plant exists once on the website. The kept list fills back up to 3 (new tags, not the used ones). | | | | |
| 6o | Sign in as a second botanist (on a phone, or the web). Open Add plant and Scan, and look at the unused tags. Scan the first botanist's kept tag. | The second botanist is not offered the first botanist's kept tags. Scanning one shows "This tag is kept for another botanist" with "Scan again". | | | | |

## Case 7: species search offline (CTIP-84)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 7a | Sign in online. Open Add plant, go to the species field, and search for a species (so the phone has saved the list). Open the Plants tab and scroll a little. | Results show with photos. | | | | |
| 7b | Airplane mode on. Close and reopen the app. In Add plant, search for a species name. | Results appear. A caption reads "Offline: searching {n} species saved on this phone (updated {date})." Pictures are small thumbnails only. No error. | | | | |
| 7c | Still offline, search by a genus or common name and by a scientific name. Pick a result. | Search finds species by those words. Picking one fills the name (and appearance if empty), like online. | | | | |
| 7d | Turn airplane mode off. Search again. | The caption disappears. Results come from the server. The saved list is refreshed (the "updated" date changes the next time you go offline). | | | | |
| 7e | Only possible on a phone that has signed in but never searched for a species while online (for example, a second phone, or after a fresh install and sign-in with no search yet). Airplane mode on. Search for a species. | The text reads "Species search needs a connection the first time. Type the name you know; an officer will match it." You can still type a name and save. | | | | |

## Case 8: records are not readable by other apps, and sync needs sign-in (CTIP-44, CTIP-74)

The app's package name is `com.ctip.biodiversity`. Use the release APK only: a debug build allows `run-as`.

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 8a | Save 1 plant in airplane mode so there is an unsent record. On the laptop, with the phone plugged in: `adb shell run-as com.ctip.biodiversity ls` | The command fails with a message like "run-as: package not debuggable" or "Could not set capabilities". It does not list any files. | | | | |
| 8b | On the laptop, clear the log with `adb logcat -c`. Force-stop and open the app, sign in, open My records. Then run `adb logcat -d -s ReactNativeJS` and look for the word "SQLCipher". | The line "[LocalDb] SQLCipher is not active; the local database is not encrypted in this build" does NOT appear. (That warning is printed only when `PRAGMA cipher_version` is empty, so no warning means the database is SQLCipher.) | | | | |
| 8c | On the laptop: `curl -i -X POST https://ctip-biodiversitysystem.onrender.com/v1/sync -H "Content-Type: application/json" -d "{}"` (no token). | The answer is 401 with a JSON body that has `code` and `message` (never HTML). Nothing is stored. | | | | |
| 8d | Replay check. After cases 2 and 3 (a send that was cut off and resent), look at the website. | Each plant and each photo is stored once. (This is the same evidence as rows 2c and 3c. Copy the result here.) | | | | |
| 8e | Back on the phone, check there are no copies of unsent records in the gallery, Downloads or the Files app. | None. Photos of unsent records are not saved to the gallery or any visible folder. | | | | |

Write the results of 8a, 8b and 8c into the CTIP-74 reassessment notes.

## Case 9: sync status screens (CTIP-68)

| # | Steps | Expected | Actual | Pass or fail | Date | Phone |
|---|---|---|---|---|---|---|
| 9a | Airplane mode on. Save 2 records. Open My records. | The bar reads "2 waiting to sync". Under "On this phone" each row shows a thumbnail, the plant name, the tag and "Waiting to sync". | | | | |
| 9b | Turn airplane mode off. Do not tap. | The records send by themselves. The group "On this phone" disappears. | | | | |
| 9c | Airplane mode on. Save 1 record. Tap "Sync now". | The toast "Still offline. They'll send when you're back online." The button is not stuck in "Sending…". | | | | |
| 9d | Airplane mode off, then tap "Sync now" with one record waiting. | While running, the button reads "Sending…" and is disabled. After, the bar shows "Last sent {time}" if records remain, or the group is gone. | | | | |
| 9e | Sign out with 1 unsent record (see 5a). Sign back in as the same botanist. | The record is still there and sends. | | | | |
| 9f | Make a record fail on a tag clash. Airplane mode on, save a new plant with a pre-printed unused tag. On the website (as officer) or another phone, register a plant with that same tag. Phone: airplane mode off, tap "Sync now". Open the record. | The record shows "Couldn't send". A warning reads "Tag {qr} is already on another plant. Choose another tag for this record." The button "Choose another tag" opens the Scan screen in pick mode. Pick a free tag: the record keeps its photos and tries again and sends. | | | | |
| 9g | Photo that cannot be sent (optional). Add a photo that is too large or not a JPEG, PNG or WebP, if you can get one onto the phone. Sync. | The record shows "Couldn't send" with "Photo {n} can't be sent: it is too large, or not a JPEG, PNG or WebP. Remove it to send the rest." and the button "Remove photo". After removing it, the rest sends. If you cannot make such a photo, mark Not run. | | | | |
| 9h | A record that can be retried. Open a "Couldn't send" record that shows the API's message. Tap "Try again". | It goes back to "Waiting to sync" and sends (when the cause is gone). | | | | |
| 9i | Delete from the phone. On an unsent record, tap "Delete from this phone". | A dialog asks "Delete this record? It hasn't been sent, so it will be lost for good." Buttons "Keep" and "Delete". "Keep" does nothing. "Delete" removes the record and any revisit that waits for it. | | | | |
| 9j | Switch the phone between light and dark theme, and turn on "Remove animations" (reduce motion). Open My records with a record on the phone, and a "Changed on another device" record. | Text is readable, colours are right in both themes, and nothing breaks with reduce motion on. Buttons are easy to tap. | | | | |
| 9k | Tab badge. With one record in "Couldn't send" or "Changed on another device", look at the My records tab. | The badge counts it, so the botanist sees it needs them. | | | | |

## Results summary

When every row is filled in, copy the totals here and into the Jira stories.

| Case | Stories | Rows passed | Rows failed or blocked | Notes |
|---|---|---|---|---|
| 1 | CTIP-83, CTIP-44, CTIP-68 | | | |
| 2 | CTIP-16, CTIP-66 | | | |
| 3 | CTIP-16, CTIP-44 | | | |
| 4 | CTIP-44 | | | |
| 5 | CTIP-68, CTIP-44 | | | |
| 6 | CTIP-67, CTIP-116 | | | |
| 7 | CTIP-84 | | | |
| 8 | CTIP-44, CTIP-74 | | | |
| 9 | CTIP-68 | | | |

For every failed row, write what you saw in Actual and tell Dino. Do not retry until a fix is in.
