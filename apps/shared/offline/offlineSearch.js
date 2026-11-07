// apps/shared/offline/offlineSearch.js
// Finding a species by name without signal (CTIP-84). The phone keeps a copy of
// the published species (apps/mobile/offline/speciesCache.js) and searches it
// here, answering in the same shape as GET /public/species so the picker cannot
// tell the difference. Plain functions with no React Native imports, so they run
// in `node --test`.
import { PAGE_SIZE, buildSpeciesQuery, cleanTerm } from "../speciesSearch.js";

// The species list is public data and changes rarely, so it is fetched again at
// most once a day unless something (the connection coming back) forces it.
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DESCRIPTION_MAX = 200; // enough for one result row, small enough for ~1000 species

const lower = (v) => String(v ?? "").toLowerCase();

// A search term that matches the way the API's `q` does (ignoring case), plus
// family and genus, which the online search does not look at but which a botanist
// typing "nep" without signal expects to find.
function matchesTerm(species, term) {
  return [species.scientific_name, species.common_name, species.family, species.genus].some((v) => lower(v).includes(term));
}

// Same result as fetchSpeciesPage: { data, meta: { page, limit, total } }.
// An empty (or one letter) term returns nothing, exactly as buildSpeciesQuery
// sends nothing; the family filter matches the whole family name, ignoring case,
// as the API does, and "all" means no filter.
export function searchSpeciesOffline(list, { q, family, page = 1, limit = PAGE_SIZE } = {}) {
  const query = buildSpeciesQuery({ q, family, page, limit });
  if (!query || !Array.isArray(list)) return { data: [], meta: { page, limit, total: 0 } };
  const term = query.q ? lower(cleanTerm(query.q)) : "";
  const fam = query.family ? lower(query.family) : "";
  const matches = list
    .filter((s) => (!term || matchesTerm(s, term)) && (!fam || lower(s.family) === fam))
    .sort((a, b) => lower(a.scientific_name).localeCompare(lower(b.scientific_name)));
  const start = (page - 1) * limit;
  return { data: matches.slice(start, start + limit), meta: { page, limit, total: matches.length } };
}

// When a request fails with no connection, may the saved species answer it?
// Page 1: yes, that is a fresh search. A later page: only if the search is already
// being answered from the phone. A search that began online has online page 1 on
// screen, and a cached page N has other matches, order and total, so appending it
// would repeat or skip rows; that page fails with the normal error and a retry.
export function shouldUseCache({ page, offline }) {
  return page === 1 || offline === true;
}

// The row that is saved on the phone: only these public fields, whatever the
// server sent. The description is cut because the picker shows one line of it.
export function cleanSpeciesRow(s) {
  const description = s.description ? String(s.description).slice(0, DESCRIPTION_MAX) : null;
  return {
    id: s.id,
    scientific_name: s.scientific_name,
    common_name: s.common_name ?? null,
    family: s.family ?? null,
    genus: s.genus ?? null,
    description,
    conservation_status: s.conservation_status ?? null,
  };
}

// True when the list was saved less than 24 hours ago. A date in the future (the
// phone's clock was set back) counts as stale, so the cache cannot freeze.
export function cacheIsFresh(cachedAt, now = Date.now()) {
  const saved = Date.parse(cachedAt ?? "");
  if (Number.isNaN(saved)) return false;
  const age = now - saved;
  return age >= 0 && age < CACHE_MAX_AGE_MS;
}
