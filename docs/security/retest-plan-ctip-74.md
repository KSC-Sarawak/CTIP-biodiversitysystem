# Re-test plan (CTIP-74)

9 Nov 2026. Who re-tests what, and the full steps for every area.

**Rule:** nobody re-tests their own fix. Nicole re-tests Michelle's (Tan's) fixes. Michelle re-tests fixes made by other people.

**Safety (everyone):**
- Live website and app: normal use only, with your own accounts.
- Attack-style tests (sign-up abuse, direct database calls): local Supabase only, never the live project.
- Screenshots must not show passwords, 6-digit codes, keys or tokens. Cover emails of other people.
- Save screenshots in `docs/testing/<area>/10nov-retest/` (for example `docs/testing/web/10nov-retest/`) on the `test-iot` branch, with the exact names below.
- 10 Nov: Michelle runs the web (W1–W8) and Supabase (S1–S4) re-tests herself; the report records "Re-tested by Michelle". Nicole can repeat them if an independent re-test is needed.

---

## 1. Who tests what

| Finding | Fixed by | Re-test by | Status |
|---|---|---|---|
| F-01, F-02, F-03 (mobile build settings) | Patrick (#47) | Michelle | **Done**, passed on app4, 4 Nov |
| F-07 (role switch in app) | Patrick | Michelle | **Done**, passed on app3, 3 Nov |
| Drafts kept after sign-out | Patrick (#47) | Michelle | **Done**, passed on app4, 4 Nov |
| F-05 (Expo tooling) | n/a | n/a | Accepted risk |
| F-04 (API packages) | Michelle (#52) | Michelle | **Pass**, 10 Nov (W5) |
| F-06 (old secret key) | Patrick (key rotated) | Michelle | **Pass**, 10 Nov (S4) |
| F-08 (new accounts active) | Michelle (#48) | Michelle | **Pass**, 10 Nov (S1) |
| F-09 (weak passwords) | Michelle (#53) | Michelle | **Pass**, 10 Nov (W3, S2) |
| F-10 (token after sign-out) | Michelle (#53) | Michelle | **Pass**, 10 Nov (W4, S2) |
| F-11 (Supabase owners, MFA) | every member | Nicole | MFA **Pass** 10 Nov (S3); Owners wait for Michelle's decision |
| F-12 (security headers) | Michelle (#50) | Michelle | **Pass**, 10 Nov (W6) |
| F-13 (map after sign-out) | Michelle (#51) | Michelle | **Pass**, 10 Nov (W2) |
| CTIP-111 (botanist QR rights) | Michelle (#49) | Michelle | **Pass**, 10 Nov (W7) |
| VA-70 MFA login | Michelle (#61) | Nicole | Web **Pass** 10 Nov (W1b); app M1 waits for new APK |
| F-14 (public MQTT broker) | Michelle (#55) + Norman | Nicole, with Norman | To do (I1) |
| F-15 (gateway trusts messages) | Norman | Michelle | To do (I2) |
| Capital-E "Endangered" bug | web team | Michelle | **Pass**, 10 Nov (W8) |
| Legacy keys still active | Michelle | Michelle | **Done**, turned off 10 Nov (S5) |

---

## 2. Web (live website)

Address: https://ctip-biodiversitysystem.pages.dev. Use a normal browser window unless a step says otherwise.

**W1. VA-70 MFA login (Nicole)**
1. Staff sign in with your officer account and password.
2. Type the 6-digit code from your authenticator app. You get in.
3. Sign out. Sign in again, and this time type `000000`.
- Expected: step 2 works; step 3 says the code is not right.
- Screenshot: `RT-W1a-mfa-code-ok.png`, `RT-W1b-mfa-wrong-code.png` (no real code visible)

**W2. F-13 map after sign-out (Nicole)**
1. Sign in as officer. Open Map and find an endangered plant (exact pin).
2. Sign out. Without pressing reload, open Map again and click the same plant.
- Expected: the plant shows only as a rounded area, no exact location.
- Screenshot: `RT-W2-map-after-signout.png`

**W3. F-09 weak password (Nicole)**
1. Sign in, open your account page, and choose Change password.
2. Try `abc123`, then try `abcdefgh` (letters only).
- Expected: both refused (at least 8 characters, with letters and digits). Do not save a new password unless you want to.
- Screenshot: `RT-W3-weak-password-refused.png`

**W4. F-10 after sign-out (Nicole)**
1. Sign in as officer and open the Review page.
2. Sign out, then press the browser Back button twice.
- Expected: no staff data shows; you see the visitor view or the sign-in page.
- Screenshot: `RT-W4-back-after-signout.png`

**W5. F-04 API packages (Nicole, on her laptop)**
```powershell
cd <repo>\services\api
git checkout main
git pull
npm install
npm audit --omit=dev
```
- Expected: `found 0 vulnerabilities`, or no High or Critical.
- Screenshot: `RT-W5-npm-audit.png`

**W6. F-12 security headers (Nicole)**
1. Open https://securityheaders.com and scan `https://ctip-biodiversitysystem.pages.dev`.
- Expected: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Strict-Transport-Security are all present.
- Screenshot: `RT-W6-headers.png`

**W7. CTIP-111 botanist QR rights (Nicole)**
1. Sign in as botanist. Open QR tags and make one new tag. It works.
2. Try to edit any tag. Try to delete a printed tag (not one of your own kept offline tags).
- Expected: step 1 works; both actions in step 2 are refused or not offered.
- Screenshot: `RT-W7-botanist-qr.png`
- Note: since 8 Nov a botanist may delete their own unused kept offline tags (CTIP-116). That is allowed and is not a fail.

**W8. Capital-E "Endangered" (Michelle)**
1. Sign in as officer. Open a species whose status is written `Endangered` (capital E).
2. Check the dashboard count, the visitor map pin, and the Edit species form.
- Expected: counted as endangered, rounded pin on the visitor map, and Edit shows Endangered (not Least concern). Do not press Save.
- Screenshot: `RT-W8-capital-e.png`

---

## 3. Mobile app (newest APK from Patrick)

The APK must be built after PR #61 (MFA). Older APKs cannot sign in staff.

**M1. VA-70 MFA in the app (Nicole)**
1. Install the new APK. Staff sign in with your botanist account.
2. If it asks to set up: tap "Open authenticator app" (or copy the key), add it, then type the 6-digit code.
3. Sign out and sign in again: it asks for the code. Try `000000` once.
- Expected: the right code works; `000000` is refused.
- Screenshot: `RT-M1a-app-code-step.png`, `RT-M1b-app-wrong-code.png` (cover the set-up key)

**M2. MobSF quick check of the new APK (Michelle)**
1. Scan the new APK in MobSF.
- Expected: still allowBackup false, no extra permissions, Min SDK 26 or higher (same as app4).
- Screenshot: `RT-M2-mobsf-summary.png`

---

## 4. Supabase

**S1. F-08 new accounts start inactive (Nicole, local Supabase only)**

Needs Docker Desktop running. If Nicole has no Docker, do it on Michelle's laptop with Nicole typing.
```powershell
cd <repo>
git checkout main
git pull
npx supabase@2 start
npx supabase@2 db reset
```
1. Open Studio (http://127.0.0.1:54323) > Authentication > Add user > "Create new user" with a test email and password.
2. Table Editor > `profiles`: find the new row.
- Expected: `is_active` = false and no staff role until an admin approves.
3. Optional: sign in to the local website with that user. It should say the account waits for an admin.
- Screenshot: `RT-S1-new-user-inactive.png`
- Afterwards: `npx supabase@2 stop`

**S2. F-09 and F-10 settings on the live project (Nicole, look only)**
1. Supabase dashboard > Authentication > Sign In / Providers (Email): minimum password length 8, letters and digits required.
2. Authentication > Sessions (or JWT settings): access token expiry 900 seconds (15 min).
- Expected: both as above. Change nothing.
- Screenshot: `RT-S2a-password-rules.png`, `RT-S2b-token-15min.png`

**S3. F-11 MFA for every member (Nicole, look only)**
1. Organisation > Team.
- Expected: MFA tick for all 7 members. Roles: as Michelle decided (2 Owners, or 7 Owners as accepted risk).
- Screenshot: `RT-S3-team-mfa.png` (cover the emails)

**S4. F-06 old secret key gone (Nicole, look only)**
1. Project Settings > API Keys > Secret keys.
- Expected: only the current secret key(s); the one from 27 Oct is not listed. Do not click Reveal.
- Screenshot: `RT-S4-secret-keys.png`

**S5. Legacy keys off (Michelle, after the team turns them off)**
1. Project Settings > API Keys > Legacy API keys.
- Expected: shown as disabled.
- Screenshot: `RT-S5-legacy-keys-off.png`

---

## 5. IoT (with Norman)

Norman's laptop runs the broker and the gateway; his ESP32 is on. Both laptops on his hotspot. Norman keeps his current certificates and passwords (old keys = accepted risk, see report F-14). Get from Norman: laptop IP, `ca.crt` (public) and node UUID. In every new PowerShell window set `$M = "C:\Program Files\mosquitto"`.

**I1. F-14 broker (Nicole, with Norman)**

1. Norman's broker window and gateway window: connected on port 8883, readings arriving.
   - Screenshot: `RT-I1a-gateway-8883.png`
2. On Nicole's laptop:
```powershell
& "$M\mosquitto_sub.exe" -h <Norman IP> -p 1883 -t "nodes/#"
```
   - Expected: refused. Screenshot: `RT-I1b-1883-refused.png`
3. Wrong password:
```powershell
& "$M\mosquitto_sub.exe" -h <Norman IP> -p 8883 --cafile ca.crt --insecure -u <node UUID> -P wrongpass123 -t "nodes/#"
```
   - Expected: `not authorised`. Screenshot: `RT-I1c-wrong-password.png`
4. The ESP32 keeps sending: the gateway prints `[TELEMETRY] <UUID> saved` every interval.
   - Screenshot: `RT-I1d-readings-arriving.png`

Type the real IP and UUID, without `< >`.

**I2. F-15 gateway checks (Michelle, with Norman)**

Norman sends these from his laptop with the node login (runbook section 5):
1. A reading with `"temperature":9999`.
   - Expected: gateway prints `skipped, temperature=9999 is outside -10..60`.
2. A message on another node's topic (`nodes/<other UUID>/telemetry`).
   - Expected: the broker log shows `Denied PUBLISH`, and the gateway never sees it.
- Screenshot: `RT-I2a-range-check.png`, `RT-I2b-other-topic-denied.png`

---

## 6. After the re-tests

1. Send all screenshots to Michelle. Michelle updates the results report to v1.0 (each finding: Re-tested by, date, Pass or Fail).
2. Jira: move each CTIP-50 bug to **Done** only when its re-test passed. Add a comment with the F-number and screenshot name.
3. A failed re-test goes back to the fixer, and is re-tested again after the new fix.
