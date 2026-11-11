// apps/web/src/pages/Login.jsx
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useStore } from "../../../shared/store.js";
import { go, useRoute } from "../useRoute.js";
import Icon from "../components/Icon.jsx";
import ForestScene from "../components/ForestScene.jsx";
import { PasswordInput } from "../components/Bits.jsx";
import { getStaffPageContent } from "../../../shared/publicContent.js";
import { PARK } from "../../../shared/site.js";

// Staff login with email and password, through the API (CTIP-114).
// "Forgot password" emails a reset link. The link opens #/login?reset=1 already
// signed in (StoreProvider reads the session from the address), where the
// person chooses a new password. #/login?expired=1: the link was used or too old.
// After a first sign-in with the default password, staff are asked to choose a new one.
// Two-step sign-in (VA-70): after the password, every staff member types the
// 6-digit code from their authenticator app ("mfa"). The first time, they scan
// a QR code to set the app up ("mfa-setup").
// Shown at #/login and on the Staff area page (#/staff) for anyone signed out.
export default function Login() {
  const { login, signIn, changePassword, notify, apiStatus, mfaEnroll, mfaVerify, mfaCancel, endedReason, clearEndedReason } = useStore();
  const { query } = useRoute();
  const staff = getStaffPageContent(PARK);
  const [mode, setMode] = useState(query.reset ? "reset" : query.expired ? "change" : "signin"); // signin | change | reset | first | mfa | mfa-setup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pending, setPending] = useState(null); // user id waiting to choose a new password
  const [code, setCode] = useState(""); // the 6-digit code (VA-70)
  const [setup, setSetup] = useState(null); // { qr, secret, uri } while setting up the app
  const [busy, setBusy] = useState(false); // a sign-in or code check is on its way: no second click
  const [error, setError] = useState(""); // why the last sign-in failed, shown on the form
  // Also shown: the account was turned off while signed in (set by the store).
  const shownError = error || endedReason;
  const clearError = () => { setError(""); clearEndedReason(); };

  const switchTo = (next) => {
    setMode(next);
    clearError();
    setPw("");
    setNewPw("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    clearError();
    const res = await login(email, pw);
    setBusy(false);
    // One message for an unknown email and a wrong password, so the form
    // cannot be used to find out who has an account.
    if (!res.ok) return setError(res.message);
    if (res.mfa === "verify") {
      setCode("");
      return setMode("mfa");
    }
    if (res.mfa === "setup") {
      const en = await mfaEnroll();
      if (!en.ok) return notify(en.message);
      setSetup(en);
      setCode("");
      return setMode("mfa-setup");
    }
    if (res.first) {
      setPending(res.id);
      return setMode("first");
    }
    signIn(res.id);
    go("/dashboard");
  };

  // VA-70: check the 6-digit code, then carry on as after a normal sign-in.
  const checkCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await mfaVerify(code);
    setBusy(false);
    if (!res.ok) return notify(res.message);
    setSetup(null);
    if (mode === "mfa-setup") notify("Two-step sign-in is set up");
    signIn(res.id);
    go("/dashboard");
  };

  const cancelCode = async () => {
    await mfaCancel();
    setSetup(null);
    switchTo("signin");
  };

  const codeField = (
    <label>
      6-digit code
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        placeholder="123456"
        required
        autoFocus
        style={{ letterSpacing: "0.3em", fontSize: 20 }}
      />
    </label>
  );

  // The reset-link form and the first sign-in prompt: set the new password.
  const change = async (e) => {
    e.preventDefault();
    const res = await changePassword(null, newPw);
    if (!res.ok) return notify(res.message);
    notify("Password changed");
    if (mode === "first") signIn(pending);
    go("/dashboard");
  };

  // "Forgot password": email a reset link.
  const sendLink = async (e) => {
    e.preventDefault();
    const res = await changePassword(email, null);
    notify(res.message);
    if (res.ok) switchTo("signin");
  };

  const skip = () => {
    signIn(pending);
    go("/dashboard");
  };

  const newFields = (
    <>
      <label>New password<PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <p className="mute small">At least 8 characters.</p>
    </>
  );

  return (
    <div className="auth">
    {/* Welcome panel: the illustrated forest, a greeting, and what signing in is for. */}
    <aside className="auth-art">
      <ForestScene />
      <div className="auth-welcome">
        <p className="overline">{PARK}</p>
        <p className="auth-title">Welcome back to <span className="hl">the forest.</span></p>
        <p>Every record you send helps protect a plant.</p>
      </div>
    </aside>
    <section className="glass pad auth-card">
      <div className="auth-logo">
        <img src="/logo.svg" alt="Daun Sense" />
      </div>
      {mode === "signin" && (
        <>
          <form onSubmit={submit}>
            <h1>Staff sign in</h1>
            <p className="mute">{staff.description}</p>
            {apiStatus === "offline" && (
              <div className="callout" role="status">
                <p><Icon name="wifiOff" size={16} /> The server is not answering right now. It can take up to a minute to wake up, so try again shortly.</p>
              </div>
            )}
            <label>Email or username<input value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} placeholder="name@sfc.my" autoComplete="username" required /></label>
            <label>Password<PasswordInput value={pw} onChange={(e) => { setPw(e.target.value); clearError(); }} autoComplete="current-password" required /></label>
            {shownError && <p className="loginerr" role="alert"><Icon name="alert" size={16} /> {shownError}</p>}
            <p className="login-forgot">
              <button type="button" className="textlink" onClick={() => switchTo("change")}>Forgot password?</button>
            </p>
            <button className="btn full" type="submit" disabled={busy}>
              <Icon name="user" size={18} /> {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Visitors need no account: send them to the public pages. */}
          <div className="login-browse">
            <p><b>Just looking around?</b> <span className="mute">No account needed.</span></p>
            <p className="textlinks">
              <a href="#/plants"><Icon name="leaf" size={18} /> Browse the plant library</a>
              <a href="#/map"><Icon name="map" size={18} /> Open the plant map</a>
            </p>
          </div>
        </>
      )}

      {mode === "mfa" && (
        <form onSubmit={checkCode}>
          <h1>Enter your code</h1>
          <p className="mute">Open your authenticator app (for example Google Authenticator) and type the 6-digit code for Daun Sense.</p>
          {codeField}
          <div className="row wrap gap-top">
            <button className="btn" type="submit" disabled={busy || code.length !== 6}><Icon name="check" size={18} /> {busy ? "Checking..." : "Verify"}</button>
            <button className="btn ghost" type="button" onClick={cancelCode}><Icon name="chevL" size={18} /> Back to sign in</button>
          </div>
          <p className="mute small" style={{ marginTop: 12 }}>Lost your phone? Ask an admin to reset your two-step sign-in.</p>
        </form>
      )}

      {mode === "mfa-setup" && setup && (
        <form onSubmit={checkCode}>
          <h1>Set up two-step sign-in</h1>
          <p className="mute">
            Every staff account needs a 6-digit code as well as its password. Install an authenticator app on your phone
            (for example Google Authenticator or Microsoft Authenticator), then scan this code with it.
          </p>
          <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
            {/* Drawn here from the set-up link (same library as the tag QR codes), so it
                does not depend on the picture format Supabase sends. */}
            {setup.uri
              ? <QRCodeSVG value={setup.uri} size={200} marginSize={2} title="QR code to scan with your authenticator app" />
              : <img src={setup.qr} alt="QR code to scan with your authenticator app" width={200} height={200} />}
          </div>
          <p className="mute small">Can't scan it? Type this key into the app instead: <code style={{ wordBreak: "break-all" }}>{setup.secret}</code></p>
          <p className="mute">Then type the 6-digit code the app shows.</p>
          {codeField}
          <div className="row wrap gap-top">
            <button className="btn" type="submit" disabled={busy || code.length !== 6}><Icon name="check" size={18} /> {busy ? "Checking..." : "Finish set-up"}</button>
            <button className="btn ghost" type="button" onClick={cancelCode}><Icon name="chevL" size={18} /> Cancel</button>
          </div>
        </form>
      )}

      {mode === "change" && (
        <form onSubmit={sendLink}>
          <h1>Reset your password</h1>
          <p className="mute">
            {query.expired
              ? "That reset link has expired or was already used. Ask for a new one below."
              : "Enter the email your account uses. We will send you a link to choose a new password."}
          </p>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="check" size={18} /> Email me a reset link</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("signin")}><Icon name="chevL" size={18} /> Back to sign in</button>
          </div>
        </form>
      )}

      {mode === "reset" && (
        <form onSubmit={change}>
          <h1>Choose a new password</h1>
          <p className="mute">You opened a password reset link. Choose your new password.</p>
          {newFields}
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="check" size={18} /> Save new password</button>
          </div>
        </form>
      )}

      {mode === "first" && (
        <form onSubmit={change}>
          <h1>Set a new password</h1>
          <p className="mute">You signed in with the default password. Choose a new one now, or keep it for later.</p>
          {newFields}
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="check" size={18} /> Change password</button>
            <button className="btn ghost" type="button" onClick={skip}>Not now</button>
          </div>
        </form>
      )}
    </section>
    </div>
  );
}
