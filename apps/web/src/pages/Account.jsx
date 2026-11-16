// apps/web/src/pages/Account.jsx
// Staff edit their own account here: photo, name, username, phone and password.
// Email and role are set by an admin, so they are shown but not editable.
//
// Laid out like the site's other welcoming pages (Discussion, Contact): a hero with a
// greeting, the photo and a "profile strength" ring over the illustrated Niah forest, then
// the settings as cards. Motion is CSS only and stops under reduced-motion.
import { useRef, useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import ForestScene from "../components/ForestScene.jsx";
import { Avatar, Chip, PasswordInput } from "../components/Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { ROLE_LABEL } from "../../../shared/permissions.js";
import { PHOTO_TYPES, fmtDate } from "../../../shared/utils.js";
import { prepareAvatar } from "../avatarImage.js";

const greeting = (h = new Date().getHours()) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

// The three things that make a profile easy to recognise and reach.
const STEPS = [
  { key: "photo", text: "Add a profile photo", done: (me) => !!me.avatar_url, field: null },
  { key: "username", text: "Choose a username", done: (me) => !!me.username, field: "acct-username" },
  { key: "phone", text: "Add a phone number", done: (me) => !!me.phone, field: "acct-phone" },
];

export default function Account() {
  const { me } = useStore();
  if (me.loading) return <Shell seg="account"><p className="mute">Loading your account…</p></Shell>;
  return (
    <Shell seg="account">
      <AccountHero me={me} />
      <div className="settings acctcards">
        <ProfileCard key={me.id} me={me} />
        <PasswordCard />
        <DetailsCard me={me} />
      </div>
    </Shell>
  );
}

function AccountHero({ me }) {
  const { updateProfile, notify } = useStore();
  const [ask, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const first = (me.full_name || "").trim().split(/\s+/)[0] || "there";
  const done = STEPS.filter((s) => s.done(me)).length;
  const pct = Math.round((done / STEPS.length) * 100);

  // Any photo is fine: it is rotated upright, cropped to a centred square and shrunk to
  // 256 px before it is saved, so a big phone photo never hits the API's size limit.
  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return notify("Choose a JPG, PNG or WebP image");
    setBusy(true);
    try {
      const avatar_url = await prepareAvatar(file);
      const res = await updateProfile({ avatar_url });
      notify(res.ok ? "Photo updated" : res.message || "Could not update photo");
    } catch (err) {
      notify(err.message || "Could not process the photo");
    } finally {
      setBusy(false);
    }
  };
  const removePhoto = async () => {
    if (!(await ask({ title: "Remove profile photo", body: "Remove your profile photo? Your initials will be shown instead.", confirmLabel: "Remove photo", danger: true }))) return;
    updateProfile({ avatar_url: null });
  };
  const goTo = (step) => {
    if (step.key === "photo") return fileRef.current?.click();
    const input = document.getElementById(step.field);
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  };

  return (
    <section className="accthero" aria-labelledby="acct-title">
      {confirmDialog}
      <ForestScene className="accthero-art" sky={false} anchor="bottom" />

      <div className="accthero-photo">
        <div className={"acctavatar" + (busy ? " busy" : "")}>
          <Avatar user={me} large />
          <label className="acctavatar-btn" title={me.avatar_url ? "Change photo" : "Upload photo"}>
            <Icon name="camera" size={18} />
            <span className="sr">{busy ? "Processing photo" : me.avatar_url ? "Change photo" : "Upload photo"}</span>
            <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(",")} onChange={pick} disabled={busy} hidden />
          </label>
        </div>
        {me.avatar_url
          ? <button type="button" className="textlink small" onClick={removePhoto}>Remove photo</button>
          : <button type="button" className="textlink small addphoto" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Processing…" : "Add a photo"}</button>}
      </div>

      <div className="accthero-text">
        <p className="overline">Account settings</p>
        <h1 id="acct-title">{greeting()}, <span className="hl">{first}</span></h1>
        <p className="mute">Your profile and sign-in details, all in one place.</p>
        <p className="row wrap accthero-chips">
          <span className="acctchip"><Icon name="user" size={14} /> {ROLE_LABEL[me.role] || me.role}</span>
          {me.username && <span className="acctchip">@{me.username}</span>}
          {me.created_at && <span className="acctchip"><Icon name="leaf" size={14} /> Member since {fmtDate(me.created_at)}</span>}
        </p>
      </div>

      <div className="acctstrength" aria-label={`Profile ${pct}% complete`}>
        <svg viewBox="0 0 64 64" className="acctring" aria-hidden="true">
          <circle cx="32" cy="32" r="27" className="acctring-track" />
          {pct > 0 && <circle cx="32" cy="32" r="27" className="acctring-fill" pathLength="100" strokeDasharray={`${pct} 100`} />}
        </svg>
        <b className="acctstrength-num">{pct}%</b>
        <span className="acctstrength-label">{pct === 100 ? "Profile complete" : "Profile strength"}</span>
        <ul className="plain acctsteps">
          {STEPS.map((s) => (
            <li key={s.key} className={s.done(me) ? "done" : ""}>
              {s.done(me)
                ? <><Icon name="check" size={14} /> {s.text.replace(/^(Add|Choose) a /, "").replace(/^./, (c) => c.toUpperCase())}</>
                : <button type="button" className="textlink" onClick={() => goTo(s)}><Icon name="plus" size={14} /> {s.text}</button>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CardTitle({ icon, children }) {
  return <h2 className="cardtitle acctcardtitle"><span className="accticon" aria-hidden="true"><Icon name={icon} size={18} /></span>{children}</h2>;
}

function ProfileCard({ me }) {
  const { updateProfile, notify } = useStore();
  const [form, setForm] = useState({ full_name: me.full_name, username: me.username || "", phone: me.phone || "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dirty = form.full_name !== me.full_name || form.username !== (me.username || "") || form.phone !== (me.phone || "");

  const save = async (e) => {
    e.preventDefault();
    const res = await updateProfile(form);
    if (!res.ok) return notify(res.message);
    setForm({ full_name: form.full_name.trim().replace(/\s+/g, " "), username: form.username.trim().toLowerCase(), phone: form.phone.trim() });
  };

  return (
    <section className="glass pad acctcard">
      <CardTitle icon="user">Profile</CardTitle>
      <p className="mute small">How you appear to other staff on records, reviews and discussions.</p>
      <form onSubmit={save}>
        <label>Full name<input value={form.full_name} onChange={set("full_name")} autoComplete="name" maxLength={80} required /></label>
        <label>Username
          <span className="prefixed"><span aria-hidden="true">@</span>
            <input id="acct-username" value={form.username} onChange={set("username")} autoComplete="username" minLength={3} maxLength={20}
              pattern="[A-Za-z0-9._]{3,20}" title="3-20 letters, numbers, dots or underscores" required />
          </span>
        </label>
        <p className="mute small">3-20 letters, numbers, dots or underscores. You can sign in with it instead of your email.</p>
        <label>Phone <span className="small">(optional)</span><input id="acct-phone" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="+60 12-345 6789" /></label>
        <div className="row wrap formend">
          <button className="btn" type="submit" disabled={!dirty}><Icon name="check" size={18} /> Save changes</button>
          {dirty && (
            <button className="btn ghost" type="button" onClick={() => setForm({ full_name: me.full_name, username: me.username || "", phone: me.phone || "" })}>Cancel</button>
          )}
        </div>
      </form>
    </section>
  );
}

// 0 to 4, from length and the kinds of characters used. A guide only: the API has the final say.
function strengthOf(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return pw.length < 8 ? Math.min(score, 1) : score;
}
const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

function PasswordCard() {
  const { changeMyPassword, notify } = useStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [ask, confirmDialog] = useConfirm();
  const strength = strengthOf(next);

  const save = async (e) => {
    e.preventDefault();
    if (next !== again) return notify("The new passwords do not match");
    if (next === current) return notify("Choose a password different from your current one");
    if (!(await ask({ title: "Change password", body: "You are about to change the password you sign in with. Use the new one from now on.", confirmLabel: "Change password", word: "CHANGE" }))) return;
    const res = await changeMyPassword(current, next);
    if (!res.ok) return notify(res.message);
    setCurrent("");
    setNext("");
    setAgain("");
    notify("Password changed");
  };

  return (
    <section className="glass pad acctcard">
      <CardTitle icon="key">Password</CardTitle>
      <p className="mute small">Use at least 8 characters. A longer one with a mix of letters, numbers and symbols is safer.</p>
      <form onSubmit={save}>
        <label>Current password<PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></label>
        <label>New password<PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
        {next && (
          <div className={"pwmeter s" + strength} aria-live="polite">
            <span className="pwmeter-bars" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="small">{STRENGTH[strength]}</span>
          </div>
        )}
        <label>Confirm new password<PasswordInput value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
        {again && (
          <p className={"small pwmatch" + (again === next ? " ok" : " no")} aria-live="polite">
            <Icon name={again === next ? "check" : "x"} size={14} /> {again === next ? "Passwords match" : "Passwords do not match yet"}
          </p>
        )}
        <div className="row wrap formend">
          <button className="btn" type="submit"><Icon name="lock" size={18} /> Change password</button>
        </div>
      </form>
      {confirmDialog}
    </section>
  );
}

function DetailsCard({ me }) {
  return (
    <section className="glass pad acctcard">
      <CardTitle icon="shield">Account details</CardTitle>
      <dl className="acctdetails">
        <div><dt><Icon name="send" size={14} /> Email</dt><dd>{me.email}</dd></div>
        <div><dt><Icon name="user" size={14} /> Role</dt><dd>{ROLE_LABEL[me.role]}</dd></div>
        <div><dt><Icon name="check" size={14} /> Status</dt><dd><Chip value={me.is_active ? "active" : "inactive"}>{me.is_active ? "Active" : "Turned off"}</Chip></dd></div>
        <div><dt><Icon name="leaf" size={14} /> Member since</dt><dd>{me.created_at ? fmtDate(me.created_at) : "-"}</dd></div>
      </dl>
      <p className="mute small"><Icon name="lock" size={14} /> Your email and role are managed by an admin. Ask them if either needs to change.</p>
    </section>
  );
}
