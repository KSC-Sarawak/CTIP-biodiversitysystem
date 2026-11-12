// apps/web/src/pages/Public.jsx
import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import CanopyLight from "../components/CanopyLight.jsx";
import ForestScene from "../components/ForestScene.jsx";
import Img from "../components/Img.jsx";
import PlantCard from "../components/PlantCard.jsx";
import { fuzzyMatch } from '../../../shared/fuzzy.js';
import { useStore } from "../../../shared/store.js";
import { visiblePlants, speciesCatalogue } from "../../../shared/selectors.js";
import { go } from "../useRoute.js";
import { SITE, PARK } from "../../../shared/site.js";
import Login from "./Login.jsx";

// Single import for all shared copy
import {
  getAboutContent,
  getHomeContent,
  getContactContent,
  getStaffPageContent,
  getAccessContent,
} from "../../../shared/publicContent.js";

// How a record reaches the public site. Shown on the About page, so the home page keeps one job.
const HOW_STEPS = [
  ["qr", "Tagged in the field", "A botanist attaches a QR tag, takes photos and records the plant's GPS location on the field app."],
  ["clipboard", "Verified by an officer", "A park officer checks the species and photos, then approves the record or returns it for changes."],
  ["leaf", "Published for everyone", "Approved plants appear in the library and on the map. Endangered plants never show an exact location."],
];

// Canopy photo used on the About page. If it cannot load, the illustrated forest behind it shows.
const CANOPY_PHOTO = "https://images.unsplash.com/photo-1470058869958-2a77ade41c02?auto=format&fit=crop&w=1800&q=70";

// A number that counts up once when it first appears (shown at once under reduced motion).
function Count({ value }) {
  const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (calm) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1200);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, calm]);
  return <span className="count-up">{(calm ? value : shown).toLocaleString("en-US")}</span>;
}

// Newest published plants first (the date an officer approved them or observed/created).
function recentPublishedPlants(db) {
  const approvedAt = (p) => {
    const obs = (db.observations || []).filter((o) => o.specimen_id === p.id && o.status === "approved");
    const rev = (db.reviews || []).filter((r) => obs.some((o) => o.id === r.observation_id));
    return rev.map((r) => r.created_at).sort().pop() || obs[0]?.observed_at || p.created_at || "";
  };
  return visiblePlants(db, "visitor").sort((a, b) => approvedAt(b).localeCompare(approvedAt(a)));
}

// Published species as fallback if no specimens are loaded
function recentPublishedSpecies(db) {
  return speciesCatalogue(db, "visitor").sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export function Home() {
  const { db, notify } = useStore();
  const [q, setQ] = useState("");
  const plants = visiblePlants(db, "visitor");
  const recentPlants = recentPublishedPlants(db);
  const recentSpecies = recentPublishedSpecies(db);
  const content = getHomeContent(PARK); // same text as the mobile home screen

  // Search jumps straight to the best match: an exact tag ID opens that plant, a name opens the species.
  const search = (e) => {
    e.preventDefault();
    const t = q.trim().toLowerCase();
    if (!t) return go("/plants");
    const tag = plants.find((p) => p && p.qr_id && p.qr_id.toLowerCase() === t);
    if (tag) return go("/tag/" + tag.qr_id);
    const hit = plants.find((p) => p.species && fuzzyMatch(`${p.name} ${p.scientific} ${p.species.family}`, t));
    if (hit) go("/plants/" + hit.species.id);
    else notify(`No published plant matches "${q.trim()}"`);
  };

  const showPlants = recentPlants.length > 0;
  const recentItems = showPlants ? recentPlants.slice(0, 4) : recentSpecies.slice(0, 4);

  // The park's name is the one highlighted phrase of the headline.
  const title = content.heroTitle;
  const cut = title.endsWith(PARK) ? title.length - PARK.length : title.length;
  const titleStart = title.slice(0, cut);
  const titleEnd = title.slice(cut);

  return (
    <>
      <section className="homehero">
        <CanopyLight />
        <ForestScene className="homehero-scene" sky={false} anchor="bottom" />
        <div className="homehero-text">
          <p className="overline">{PARK}</p>
          <h1>{titleStart}{titleEnd && <span className="hl">{titleEnd}</span>}</h1>
          <p className="lede">{content.heroSubtitle}</p>
          <form className="bigsearch" onSubmit={search} role="search">
            <label className="search">
              <Icon name="search" size={20} />
              <span className="sr">Search plants</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plant name or tag ID, e.g. NIAH-0001" />
            </label>
            <button className="btn" type="submit">Search</button>
          </form>
          <p className="scanline">
            In the forest?
            <a className="scanbadge" href="#/scan" aria-label="Open plant QR tag scanner"><Icon name="qr" size={20} /> Scan a plant tag</a>
          </p>
        </div>
      </section>

      <section className="gap-section" aria-labelledby="recent">
        <div className="row between wrap">
          <h2 id="recent">{content.recentSectionTitle}</h2>
          <a className="textlink" href="#/plants">See all plants <Icon name="arrowR" size={16} /></a>
        </div>
        {recentItems.length === 0 ? (
          <p className="mute" style={{ margin: "16px 0" }}>No published plant records yet.</p>
        ) : (
          <div className="plantgrid">
            {recentItems.map((item) => (
              <PlantCard
                key={item.id}
                href={item.qr_id ? `#/tag/${item.qr_id}` : `#/plants/${item.id}`}
                photo={item.photo || item.photos?.[0]?.url}
                family={item.species?.family || item.family}
                name={item.name}
                scientific={item.scientific || item.scientific_name}
                conservation={item.conservation || item.conservation_status}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function About() {
  const { db } = useStore();
  const content = getAboutContent(SITE, PARK);
  const plants = visiblePlants(db, "visitor");
  const species = speciesCatalogue(db, "visitor");
  const families = new Set(plants.map((p) => p.species?.family).filter(Boolean));
  const stats = [
    [plants.length, plants.length === 1 ? "plant published" : "plants published"],
    [species.length, species.length === 1 ? "species" : "species"],
    [families.size, families.size === 1 ? "plant family" : "plant families"],
  ].filter(([n]) => n > 0);

  return (
    <div className="aboutpage">
      <section className="about-hero">
        <ForestScene className="about-hero-art" />
        <Img className="about-hero-photo" src={CANOPY_PHOTO} alt="" loading="eager" />
        <div className="about-hero-text">
          <p className="overline">{content.title}</p>
          <h1>A living record of every plant in <span className="hl">{PARK}</span></h1>
          <p className="lede">{content.paragraphs[0]}</p>
          <p className="about-actions">
            <a className="btn" href="#/plants"><Icon name="leaf" size={18} /> Browse the plants</a>
            <a className="btn ghost" href="#/map"><Icon name="map" size={18} /> Open the map</a>
          </p>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="about-stats" aria-label="The library today">
          {stats.map(([n, label]) => (
            <p key={label}><b><Count value={n} /></b><span>{label}</span></p>
          ))}
        </section>
      )}

      <section className="about-split reveal">
        <div className="about-split-text">
          <p className="overline">Why it exists</p>
          <h2>From paper notebooks to one record per plant</h2>
          <p>Plant records in the park used to live on paper. Daun Sense gives every tagged plant one permanent record, with its photos, its species and where it grows, so anyone who stands in front of it later can pick up where the last person left off.</p>
          <p className="mute">{content.paragraphs[1]}</p>
        </div>
        <figure className="tagart" aria-hidden="true">
          <div className="tagart-card">
            <span className="tagart-hole" />
            <span className="tagart-qr">{Array.from({ length: 49 }, (_, i) => <i key={i} className={[0, 1, 2, 7, 9, 14, 15, 16, 4, 5, 6, 11, 13, 18, 19, 20, 28, 29, 30, 35, 37, 42, 43, 44, 24, 26, 32, 40, 46, 22, 38].includes(i) ? "on" : ""} />)}</span>
            <span className="tagart-id">NIAH-0001</span>
            <span className="tagart-name">Scan me in the forest</span>
          </div>
        </figure>
      </section>

      <section className="gap-section reveal" aria-labelledby="how">
        <p className="overline">The journey of a record</p>
        <h2 id="how">How a plant gets here</h2>
        <ol className="steps3">
          {HOW_STEPS.map(([icon, title, text], i) => (
            <li className="stepcard" key={title}>
              <span className="stepnum" aria-hidden="true"><Icon name={icon} size={22} /></span>
              <span className="stepcount">Step {i + 1}</span>
              <h3>{title}</h3>
              <p className="mute">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="gap-section reveal" aria-labelledby="built">
        <p className="overline">Built for the forest</p>
        <h2 id="built">Made to work where the plants are</h2>
        <div className="featuregrid">
          <article><Icon name="cloudOff" size={24} /><h3>Works without signal</h3><p>Field records are saved on the phone and sent when it is back online.</p></article>
          <article><Icon name="qr" size={24} /><h3>One tag, one plant</h3><p>Each plant keeps the same QR tag, so every visit adds to the same record.</p></article>
          <article><Icon name="eyeOff" size={24} /><h3>Rare plants stay hidden</h3><p>Exact locations of endangered plants are never shown to the public.</p></article>
          <article><Icon name="activity" size={24} /><h3>Sensors keep watch</h3><p>Nodes beside protected plants report soil and air readings, and alert staff if something changes.</p></article>
        </div>
      </section>

      <section className="gap-section reveal" aria-labelledby="who">
        <p className="overline">Who it is for</p>
        <h2 id="who">One library, many readers</h2>
        <div className="audiencegrid">
          <article><Icon name="compass" size={22} /><h3>Visitors and park guides</h3><p>Scan a tag on the trail to learn what a plant is and why it matters.</p></article>
          <article><Icon name="book" size={22} /><h3>Researchers</h3><p>Browse verified records with photos, families and conservation status.</p></article>
          <article><Icon name="shield" size={22} /><h3>Park staff</h3><p>Record, review and protect plants, and respond to sensor alerts.</p></article>
        </div>
      </section>

      <section className="partners reveal" aria-label="Partners">
        <p className="overline">Made together with</p>
        <ul>
          <li>Sarawak Forestry Corporation</li>
          <li>NeuonAI Sdn Bhd</li>
          <li>Swinburne University of Technology Sarawak</li>
        </ul>
      </section>

      <section className="ctaband reveal">
        <ForestScene className="ctaband-art" />
        <div className="ctaband-text">
          <h2>Step into <span className="hl">the forest.</span></h2>
          <p>Start with a name, a tag, or a place on the map.</p>
          <p className="about-actions">
            <a className="btn" href="#/plants"><Icon name="leaf" size={18} /> Browse the plants</a>
            <a className="btn ghost" href="#/scan"><Icon name="qr" size={18} /> Scan a tag</a>
          </p>
        </div>
      </section>
    </div>
  );
}

const CONTACT_TOPICS = ["A plant or its record", "Visiting the park", "A staff account", "Something else"];

export function Contact() {
  const { notify } = useStore();
  const content = getContactContent();
  const [topic, setTopic] = useState(CONTACT_TOPICS[0]);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [message, setMessage] = useState("");

  // Nothing is sent from this page: the message opens, filled in, in the visitor's own email app.
  const mailto = () => {
    const body = [message.trim(), "", tag.trim() && `Tag ID: ${tag.trim()}`, name.trim() && `From: ${name.trim()}`].filter((x) => x !== false && x !== "").join("\n");
    return `mailto:${content.email}?subject=${encodeURIComponent(`Daun Sense: ${topic}`)}&body=${encodeURIComponent(body)}`;
  };
  const send = (e) => {
    e.preventDefault();
    if (!message.trim()) return notify("Write a message first");
    window.location.href = mailto();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content.email);
      notify("Email address copied");
    } catch {
      notify(`Copy this address: ${content.email}`);
    }
  };

  return (
    <div className="contactpage">
      <section className="contact-hero">
        <ForestScene className="contact-hero-art" anchor="bottom" />
        <div className="contact-hero-text">
          <p className="overline">{content.title}</p>
          <h1>We would love to <span className="hl">hear from you.</span></h1>
          <p className="lede">Questions about a plant, a record, or visiting {PARK}? Write to the team and we will get back to you.</p>
        </div>
      </section>

      <div className="contact-grid">
        <form className="glass contact-form" onSubmit={send}>
          <h2>Send a message</h2>
          <label>What is it about?
            <select id="contact-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {CONTACT_TOPICS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          {topic === CONTACT_TOPICS[0] && (
            <label>Tag ID <span className="mute">(optional)</span>
              <input id="contact-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="NIAH-0001" />
            </label>
          )}
          <label>Your name <span className="mute">(optional)</span>
            <input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label>Message
            <textarea id="contact-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" />
          </label>
          <button className="btn" type="submit"><Icon name="send" size={18} /> Open in my email app</button>
          <p className="mute small">Your email app opens with this message filled in. Nothing is sent until you press send there.</p>
        </form>

        <aside className="contact-cards">
          <article className="glass contact-card">
            <span className="contact-ic"><Icon name="send" size={22} /></span>
            <div>
              <h3>Email</h3>
              <p><a className="textlink" href={`mailto:${content.email}`}>{content.email}</a></p>
              <button type="button" className="btn ghost small-btn" onClick={copy}>Copy address</button>
            </div>
          </article>
          <article className="glass contact-card">
            <span className="contact-ic"><Icon name="pin" size={22} /></span>
            <div>
              <h3>{content.organization}</h3>
              <p className="mute">{content.address}</p>
            </div>
          </article>
          <article className="glass contact-card">
            <span className="contact-ic"><Icon name="qr" size={22} /></span>
            <div>
              <h3>About a particular plant?</h3>
              <p className="mute">Include its tag ID. You will find it on the QR tag and at the top of the plant's page.</p>
            </div>
          </article>
          <article className="glass contact-card">
            <span className="contact-ic"><Icon name="key" size={22} /></span>
            <div>
              <h3>Need a staff account?</h3>
              <p className="mute">Accounts are created by an admin. <a className="textlink" href="#/staff">Staff sign in</a></p>
            </div>
          </article>
        </aside>
      </div>
    </div>
  );
}

// "Staff sign in" in the header opens this. Signed out: the sign-in form itself,
// so staff do not need a second click. Signed in: a way to their dashboard.
export function StaffPage() {
  const { me } = useStore();
  const content = getStaffPageContent(PARK);
  if (!me) return <Login />;

  return (
    <section className="glass pad prose narrow">
      <h1>{content.title}</h1>
      <p>You are signed in as {me.full_name}.</p>
      <a className="btn" href="#/dashboard"><Icon name="dashboard" size={18} /> Go to dashboard</a>
    </section>
  );
}

export function NoAccess() {
  const { role } = useStore();
  const content = getAccessContent();

  return (
    <section className="glass pad prose narrow">
      <h1>{content.noAccessTitle}</h1>
      <p>{role === "visitor" ? content.visitorText : content.staffText}</p>
      {role === "visitor" ? (
        <a className="btn" href="#/login"><Icon name="user" size={18} /> Go to login</a>
      ) : (
        <a className="btn" href="#/dashboard"><Icon name="chevL" size={18} /> Back to dashboard</a>
      )}
    </section>
  );
}

export function NotFound() {
  const content = getAccessContent();
  return (
    <section className="glass pad prose narrow">
      <h1>{content.notFoundTitle}</h1>
      <p>{content.notFoundText}</p>
      <a className="btn" href="#/"><Icon name="home" size={18} /> Home</a>
    </section>
  );
}
