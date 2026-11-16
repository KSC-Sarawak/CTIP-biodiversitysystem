// Sample data for the demo video: a believable morning at Niah National Park.
// Nothing here comes from the live database.
import { plantSvg, camSvg, dataUrl } from "./art.mjs";

const pad = (n, w = 12) => String(n).padStart(w, "0");
const uid = (p, n) => `${p}-0000-4000-8000-${pad(n)}`;
export const NOW = Date.UTC(2026, 10, 16, 2, 30); // 10:30 at Niah (UTC+8)
const ago = (min) => new Date(NOW - min * 60000).toISOString();

export const PEOPLE = {
  officer: { id: uid("11111111", 1), full_name: "Aisyah Rahman", email: "aisyah@sfc.example", role: "officer", is_active: true },
  admin: { id: uid("11111111", 2), full_name: "Jonathan Sim", email: "jonathan@sfc.example", role: "admin", is_active: true },
  bot1: { id: uid("11111111", 3), full_name: "Daniel Lau", email: "daniel@sfc.example", role: "botanist", is_active: true },
  bot2: { id: uid("11111111", 4), full_name: "Mei Ling Wong", email: "meiling@sfc.example", role: "botanist", is_active: true },
  bot3: { id: uid("11111111", 5), full_name: "Rafiq Jalil", email: "rafiq@sfc.example", role: "botanist", is_active: true },
  off2: { id: uid("11111111", 6), full_name: "Grace Entalang", email: "grace@sfc.example", role: "officer", is_active: true },
  bot4: { id: uid("11111111", 7), full_name: "Samuel Ngu", email: "samuel@sfc.example", role: "botanist", is_active: false },
};

const SP = [
  ["Nepenthes rafflesiana", "Raffles' pitcher plant", "Nepenthaceae", "Nepenthes", "least concern", "pitcher", "A climbing carnivorous plant with squat lower pitchers and funnel-shaped upper pitchers. It traps insects in a pool of digestive fluid.", "Heath forest and peat swamp edges on poor sandy soils.", "Pitchers were traditionally used as small vessels for cooking rice."],
  ["Rafflesia tuan-mudae", "Rafflesia", "Rafflesiaceae", "Rafflesia", "vulnerable", "rafflesia", "A parasitic plant with no leaves, stems or roots. Its flower can reach almost a metre across and blooms for only a few days.", "Lives inside Tetrastigma vines on the lowland forest floor.", "An emblem of Sarawak's forests and a draw for visitors."],
  ["Eusideroxylon zwageri", "Belian (Borneo ironwood)", "Lauraceae", "Eusideroxylon", "vulnerable", "tree", "One of the hardest and most durable timbers in the world. Slow growing, reaching 50 m after several centuries.", "Lowland mixed dipterocarp forest, often near rivers.", "Used for longhouse posts, roof shingles and burial poles."],
  ["Shorea macrophylla", "Engkabang", "Dipterocarpaceae", "Shorea", "least concern", "flowerTree", "A fast-growing riverside dipterocarp with large winged fruit. Its nuts yield illipe butter.", "Riverbanks and periodically flooded alluvial forest.", "Illipe nuts are collected and traded during mast fruiting years."],
  ["Paphiopedilum sanderianum", "Sander's slipper orchid", "Orchidaceae", "Paphiopedilum", "critically endangered", "orchid", "A slipper orchid famous for petals that can hang almost a metre long. Rediscovered in Sarawak in 1978.", "Shaded limestone cliffs with constant seepage.", "Heavily targeted by illegal collectors."],
  ["Dipteris conjugata", "Umbrella fern", "Dipteridaceae", "Dipteris", "least concern", "fern", "A fern with fan-shaped fronds split into two halves, held on tall stalks above a creeping rhizome.", "Open ridges, clearings and forest margins.", "Young fronds are used in traditional remedies."],
  ["Licuala orbicularis", "Biris fan palm", "Arecaceae", "Licuala", "near threatened", "palm", "An understorey palm with near-circular, pleated, undivided leaves up to a metre across.", "Deep shade of lowland mixed dipterocarp forest. Found only in Sarawak.", "Leaves are used for wrapping food and for thatch."],
  ["Etlingera elatior", "Torch ginger (Kantan)", "Zingiberaceae", "Etlingera", "least concern", "ginger", "A tall ginger with waxy pink flower heads that rise straight from the ground on their own stalks.", "Forest edges and secondary growth.", "The flower bud flavours laksa and many local dishes."],
  ["Aquilaria malaccensis", "Gaharu (agarwood)", "Thymelaeaceae", "Aquilaria", "critically endangered", "leafy", "A tree that produces fragrant resinous heartwood when infected by a mould. Wild trees are felled in search of it.", "Lowland and hill forest on well-drained slopes.", "Agarwood is among the most valuable non-timber forest products."],
  ["Bulbophyllum beccarii", "Beccari's bulbophyllum", "Orchidaceae", "Bulbophyllum", "near threatened", "orchid", "A giant epiphytic orchid whose leaves wrap a tree trunk like a basket and collect leaf litter.", "Climbs trunks in lowland rainforest.", "Named after the botanist Odoardo Beccari, who collected in Sarawak."],
  ["Dryobalanops lanceolata", "Kapur paji", "Dipterocarpaceae", "Dryobalanops", "endangered", "tree", "An emergent dipterocarp reaching 80 m, with a straight trunk and camphor-scented resin.", "Fertile clay soils in lowland forest. Found only in Borneo.", "A source of Borneo camphor."],
  ["Nepenthes ampullaria", "Flask-shaped pitcher plant", "Nepenthaceae", "Nepenthes", "least concern", "pitcher", "Unlike its relatives, it feeds mostly on fallen leaves that drop into its carpet of round pitchers.", "Damp, shaded forest floor in heath and peat swamp forest.", "Pitchers shelter frogs and mosquito larvae."],
];

export const species = SP.map((s, i) => ({
  id: uid("33333333", i + 1), scientific_name: s[0], common_name: s[1], family: s[2], genus: s[3], conservation_status: s[4],
  description: s[6], ecology: s[7], cultural_significance: s[8], is_published: true, is_deleted: false, updated_at: ago(60 * 24 * (i + 2)), created_at: ago(60 * 24 * 40),
}));
const kindOf = Object.fromEntries(SP.map((s, i) => [uid("33333333", i + 1), s[5]]));

export const species_media = species.flatMap((s, i) => [0, 1].map((k) => ({
  id: uid("55555555", i * 2 + k + 1), species_id: s.id, url: dataUrl(plantSvg(kindOf[s.id], i * 3 + k * 7 + 2, k ? "dusk" : undefined)), s3_bucket: "species-media", s3_key: `species/${i}-${k}.jpg`,
  caption: k ? "Habitat view" : "Whole plant", credit: "Sample illustration", is_primary: k === 0, sort_order: k, uploaded_by: PEOPLE.officer.id, created_at: ago(60 * 24 * 20),
})));

// [species index or null, guess, botanist, lat, lng, status, minutes ago, height, morphology, notes]
const B = PEOPLE;
const REC = [
  [0, "", B.bot1, 3.8012, 113.7716, "approved", 60 * 30, 180, "Upper pitchers funnel shaped, red-speckled", "Climbing on shrubs beside the boardwalk"],
  [1, "", B.bot2, 3.8068, 113.7662, "approved", 60 * 52, 12, "Bud about 14 cm, not yet open", "On Tetrastigma vine, 40 m off the Great Cave trail"],
  [2, "", B.bot1, 3.7985, 113.7781, "approved", 60 * 75, 3200, "Buttressed trunk, dark fissured bark", "Mature tree near Sungai Niah"],
  [3, "", B.bot3, 3.7961, 113.7809, "approved", 60 * 100, 2400, "Large winged fruit on the ground", "Riverbank, fruiting"],
  [4, "", B.bot2, 3.8121, 113.7604, "approved", 60 * 120, 35, "Two flowers, petals about 60 cm", "Limestone face, seepage zone"],
  [5, "", B.bot3, 3.8037, 113.7741, "approved", 60 * 140, 150, "Fronds split in two fans", "Open ridge above the park HQ"],
  [6, "", B.bot1, 3.7999, 113.7688, "approved", 60 * 160, 210, "Round pleated leaves, about 80 cm across", "Deep shade, 20 m from the trail"],
  [7, "", B.bot2, 3.7942, 113.7752, "approved", 60 * 190, 320, "Three flower heads open", "Forest edge by the jetty"],
  [8, "", B.bot3, 3.8094, 113.7639, "approved", 60 * 220, 1400, "Smooth pale bark, no wounds seen", "Slope behind Traders' Cave"],
  [10, "", B.bot1, 3.8049, 113.7797, "approved", 60 * 260, 5200, "Straight bole, camphor smell from resin", "Emergent tree on clay soil"],
  [9, "", B.bot2, 3.8081, 113.7728, "approved", 60 * 300, 90, "Leaves wrapped around host trunk", "About 3 m up a dipterocarp"],
  [0, "", B.bot3, 3.8024, 113.7669, "approved", 60 * 330, 140, "Lower pitchers squat, winged", "Heath forest patch"],
  // waiting for the officer
  [null, "Nepenthes ampullaria", B.bot1, 3.8003, 113.7735, "synced", 38, 25, "Round green pitchers in a carpet on the ground", "Damp hollow beside the boardwalk, about 30 pitchers"],
  [null, "Etlingera elatior", B.bot2, 3.7957, 113.7771, "synced", 95, 280, "Pink waxy flower head on a separate stalk", "Clump of six stems near the river"],
  [null, "Unknown orchid", B.bot3, 3.8109, 113.7621, "synced", 170, 22, "Small yellow flowers, single leaf per bulb", "On a fallen branch, limestone area"],
  [null, "Licuala sp.", B.bot1, 3.8031, 113.7702, "synced", 240, 160, "Fan leaf, split into segments", "Shaded slope"],
  // sent back to the botanist
  [null, "Shorea sp.", B.bot2, 3.7973, 113.7823, "returned", 60 * 20, 1800, "Tall tree, could not reach leaves", "Needs a clearer photo of the bark and a fallen leaf"],
];

export const specimens = REC.map((r, i) => ({
  id: uid("aaaaaaaa", i + 1), qr_id: `NIAH-${pad(i + 1, 4)}`, species_id: r[0] == null ? null : species[r[0]].id, proposed_species_name: r[1] || (r[0] != null ? species[r[0]].scientific_name : ""),
  registered_by: r[2].id, lat: r[3], lng: r[4], gps_accuracy_m: 4 + (i % 5), endangered_override: false, is_deleted: false, updated_at: ago(r[6]), created_at: ago(r[6]),
}));
const guessKind = { "Nepenthes ampullaria": "pitcher", "Etlingera elatior": "ginger", "Unknown orchid": "orchid", "Licuala sp.": "palm", "Shorea sp.": "tree" };

export const observations = REC.map((r, i) => ({
  id: uid("bbbbbbbb", i + 1), specimen_id: specimens[i].id, recorded_by: r[2].id, status: r[5], version: 1, observed_at: ago(r[6] + 12), last_synced_at: ago(r[6]), updated_at: ago(r[6]), created_at: ago(r[6]),
  device_id: "pixel-7", height_cm: r[7], morphology: r[8], notes: r[9], lat: r[3], lng: r[4], gps_accuracy_m: 4 + (i % 5),
}));
// A second visit to the first two plants, so they have a growth history.
[[0, 60 * 24 * 21, 164], [0, 60 * 24 * 45, 150], [1, 60 * 24 * 14, 9]].forEach(([i, min, h], k) => observations.push({
  ...observations[i], id: uid("bbbbbbbb", 100 + k), observed_at: ago(min), last_synced_at: ago(min), updated_at: ago(min), created_at: ago(min), height_cm: h, status: "approved", notes: "Routine revisit",
}));

const TRAITS = ["Whole plant", "Leaf", "Flower"];
export const observation_photos = observations.flatMap((o, i) => {
  const r = REC[i] || REC[0];
  const kind = r[0] != null ? SP[r[0]][5] : guessKind[r[1]] || "leafy";
  const n = i < REC.length ? 3 : 1;
  return Array.from({ length: n }, (_, k) => ({
    id: uid("cccccccc", i * 4 + k + 1), observation_id: o.id, url: dataUrl(plantSvg(k === 1 ? "leafy" : kind, i * 5 + k * 3 + 1, ["forest", "mist", "dusk"][k])), s3_bucket: "observation-photos", s3_key: `obs/${i}-${k}.jpg`,
    trait: TRAITS[k], is_primary: k === 0, created_at: o.observed_at,
  }));
});

export const observation_reviews = observations.filter((o) => o.status === "approved" || o.status === "returned").map((o, i) => ({
  id: uid("dddddddd", i + 1), observation_id: o.id, reviewer_id: PEOPLE.officer.id, observation_version: 1, decision: o.status === "returned" ? "returned" : "approved",
  comment: o.status === "returned" ? "Please add a clearer photo of the bark and a fallen leaf." : "", created_at: o.updated_at,
}));
export const observation_comments = [
  { id: uid("eeeeeeee", 1), observation_id: observations[16].id, author_id: PEOPLE.officer.id, body: "Could be S. macrophylla. A fallen leaf would settle it.", created_at: ago(60 * 19) },
  { id: uid("eeeeeeee", 2), observation_id: observations[16].id, author_id: PEOPLE.bot2.id, body: "Going back on Thursday, will photograph the bark too.", created_at: ago(60 * 18) },
  { id: uid("eeeeeeee", 3), observation_id: observations[12].id, author_id: PEOPLE.bot1.id, body: "Pitchers sit on the ground in a mat, so I think ampullaria.", created_at: ago(30) },
];

export const qr_tags = Array.from({ length: 40 }, (_, i) => ({
  qr_id: `NIAH-${pad(i + 1, 4)}`, status: i < REC.length ? "assigned" : i === 38 ? "damaged" : "unassigned", batch_label: i < 20 ? "Batch 2026-10 A" : "Batch 2026-11 B", created_by: PEOPLE.officer.id, created_at: ago(60 * 24 * (i < 20 ? 30 : 6)),
}));

const NODES = [["NODE-01 · Limestone seep", 4], ["NODE-02 · Gaharu slope", 8], ["NODE-03 · Rafflesia vine", 1]];
export const sensor_nodes = NODES.map(([name, sp], i) => ({
  id: uid("99999999", i + 1), name, specimen_id: specimens[sp].id, status: "active", thresholds: null, last_seen: ago(2 + i), lat: specimens[sp].lat, lng: specimens[sp].lng, created_at: ago(60 * 24 * 18),
}));
export const telemetry = sensor_nodes.flatMap((n, k) => Array.from({ length: 96 }, (_, i) => {
  const t = i / 96, day = Math.sin((t - 0.2) * Math.PI * 2);
  return {
    id: `t${k}-${i}`, node_id: n.id, ts: ago((95 - i) * 15 + 2),
    temperature: +(26.5 + day * 3.2 + k * 0.6 + Math.sin(i * 1.7) * 0.4).toFixed(1),
    humidity: +(84 - day * 9 + Math.sin(i * 0.9) * 2).toFixed(1),
    soil_moisture: +(k === 2 ? 46 - t * 30 + Math.sin(i) * 1.2 : 55 + Math.sin(i * 0.3 + k) * 6).toFixed(1),
    motion_detected: k === 1 && i === 93,
  };
}));
export const sensor_stable_ranges = [
  { field: "temperature", min_value: 18, max_value: 35 }, { field: "humidity", min_value: 40, max_value: 100 }, { field: "soil_moisture", min_value: 20, max_value: 80 },
];
export const alerts = [
  { id: uid("77777777", 1), node_id: sensor_nodes[1].id, type: "Motion detected", reading: { motion_detected: true }, severity: "high", status: "open", created_at: ago(16) },
  { id: uid("77777777", 2), node_id: sensor_nodes[2].id, type: "Soil moisture low", reading: { soil_moisture: 17.4 }, severity: "medium", status: "acknowledged", acknowledged_by: PEOPLE.officer.id, created_at: ago(140) },
  { id: uid("77777777", 3), node_id: sensor_nodes[0].id, type: "Overheat", reading: { temperature: 36.2 }, severity: "medium", status: "resolved", resolved_by: PEOPLE.off2.id, resolved_at: ago(60 * 26), created_at: ago(60 * 28) },
];
export const alert_notes = [{ id: uid("78787878", 1), alert_id: alerts[2].id, author_id: PEOPLE.off2.id, note: "Shade cloth refitted over the node.", created_at: ago(60 * 26) }];
export const sensor_images = [
  { id: uid("76767676", 1), node_id: sensor_nodes[1].id, alert_id: alerts[0].id, captured_at: ago(16), view_url: dataUrl(camSvg()) },
];

const note = (n, user, type, title, body, table, id, min, read = false) => ({ id: uid("66666666", n), user_id: user.id, type, title, body, related_table: table, related_id: id, is_read: read, created_at: ago(min) });
export const notifications = [PEOPLE.officer, PEOPLE.admin].flatMap((u, k) => [
  note(k * 10 + 1, u, "alert_created", "Motion detected", "NODE-02 · Gaharu slope reported movement near a critically endangered plant.", "alerts", alerts[0].id, 16),
  note(k * 10 + 2, u, "comment_reply", "New record to review", "Daniel Lau sent a record for NIAH-0013.", "observations", observations[12].id, 38),
  note(k * 10 + 3, u, "comment_reply", "New record to review", "Mei Ling Wong sent a record for NIAH-0014.", "observations", observations[13].id, 95),
  note(k * 10 + 4, u, "alert_created", "Soil moisture low", "NODE-03 · Rafflesia vine read 17.4%.", "alerts", alerts[1].id, 140, true),
]);

export const audit_logs = [
  ["UPDATE", "observations", observations[11].id, { status: "synced" }, { status: "approved" }, PEOPLE.officer, 60 * 5],
  ["INSERT", "qr_tags", "NIAH-0040", null, { batch_label: "Batch 2026-11 B" }, PEOPLE.officer, 60 * 24 * 6],
  ["UPDATE", "profiles", PEOPLE.bot4.id, { is_active: true }, { is_active: false }, PEOPLE.admin, 60 * 24 * 3],
  ["UPDATE", "species", species[4].id, { conservation_status: "endangered" }, { conservation_status: "critically endangered" }, PEOPLE.officer, 60 * 24 * 4],
  ["INSERT", "sensor_nodes", sensor_nodes[2].id, null, { name: NODES[2][0] }, PEOPLE.admin, 60 * 24 * 18],
  ["UPDATE", "alerts", alerts[2].id, { status: "open" }, { status: "resolved" }, PEOPLE.off2, 60 * 26],
].map((a, i) => ({ id: uid("88888888", i + 1), action: a[0], table_name: a[1], record_id: a[2], old_value: a[3], new_value: a[4], changed_by: a[5].id, changed_at: ago(a[6]) }));

export function workspace(role) {
  const me = role === "admin" ? PEOPLE.admin : role === "botanist" ? PEOPLE.bot1 : PEOPLE.officer;
  return {
    species, species_media, qr_tags, specimens, observations, observation_photos, observation_reviews, observation_comments,
    alerts, alert_notes, sensor_nodes, telemetry, sensor_node_nicknames: [], sensor_stable_ranges,
    notifications: notifications.filter((n) => n.user_id === me.id), audit_logs, profiles: Object.values(PEOPLE), zones: [],
  };
}

// What a visitor gets: published species, approved plants, threatened locations snapped to a ~1.1 km grid.
export function publicWorkspace() {
  const pub = species.filter((s) => s.is_published);
  const threatened = new Set(pub.filter((s) => /endangered/.test(s.conservation_status)).map((s) => s.id));
  const snap = (v) => Math.round(v * 100) / 100;
  const okObs = observations.filter((o) => o.status === "approved");
  const okIds = new Set(okObs.map((o) => o.specimen_id));
  return {
    species: pub, species_media,
    specimens: specimens.filter((s) => okIds.has(s.id)).map((s) => threatened.has(s.species_id) ? { ...s, lat: snap(s.lat), lng: snap(s.lng), location_reduced: true } : s),
    observations: okObs, observation_photos: observation_photos.filter((p) => okObs.some((o) => o.id === p.observation_id)),
    qr_tags: [], observation_reviews: [], observation_comments: [], alerts: [], alert_notes: [], sensor_nodes: [], notifications: [], audit_logs: [], profiles: [], zones: [],
  };
}
