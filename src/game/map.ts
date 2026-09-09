/**
 * The board.
 *
 * Seventy-five provinces, drawn from the standard 1901 map. The topology is
 * a fact about a published game and free to use -- an adjacency list is not
 * expression, and every implementation of this game since 1959 has used the
 * same one. The *artwork* is Avalon Hill's and is not here: the map this
 * game draws is generated from the data below, the way the cave game's
 * dodecahedron and the starship game's grid are.
 *
 * Two adjacency lists, because the two unit types do not move on the same
 * graph. An army walks the land; a fleet follows water and hugs coastlines,
 * which is why Wales and Yorkshire are neighbours for one and strangers for
 * the other. Three provinces have two coasts that do not connect to each
 * other, and a fleet in one of them has to say which -- those are keyed
 * `stp/nc` and so on, and the bare province id is never a fleet position.
 */

export type Power = 'austria' | 'england' | 'france' | 'germany' | 'italy' | 'russia' | 'turkey'

export const POWERS: readonly Power[] = [
  'austria',
  'england',
  'france',
  'germany',
  'italy',
  'russia',
  'turkey',
]

/** `land` is inland, `coast` touches water, `sea` is water. */
export type Terrain = 'land' | 'sea' | 'coast'

export interface Province {
  name: string
  terrain: Terrain
  /** A supply centre: the only thing anybody is actually counting. */
  sc: boolean
  /** Whose home centre it is, for builds. */
  home?: Power
  /** Named coasts, when a fleet has to choose one. */
  coasts?: readonly string[]
}

const P = (
  name: string,
  terrain: Terrain,
  sc = false,
  home?: Power,
  coasts?: readonly string[],
): Province => ({ name, terrain, sc, home, coasts })

export const PROVINCES: Record<string, Province> = {
  // --- seas ---------------------------------------------------------------
  adr: P('Adriatic Sea', 'sea'),
  aeg: P('Aegean Sea', 'sea'),
  bal: P('Baltic Sea', 'sea'),
  bar: P('Barents Sea', 'sea'),
  bla: P('Black Sea', 'sea'),
  bot: P('Gulf of Bothnia', 'sea'),
  eas: P('Eastern Mediterranean', 'sea'),
  eng: P('English Channel', 'sea'),
  hel: P('Helgoland Bight', 'sea'),
  ion: P('Ionian Sea', 'sea'),
  iri: P('Irish Sea', 'sea'),
  lyo: P('Gulf of Lyon', 'sea'),
  mao: P('Mid-Atlantic Ocean', 'sea'),
  nao: P('North Atlantic Ocean', 'sea'),
  nth: P('North Sea', 'sea'),
  nwg: P('Norwegian Sea', 'sea'),
  ska: P('Skagerrak', 'sea'),
  tys: P('Tyrrhenian Sea', 'sea'),
  wes: P('Western Mediterranean', 'sea'),

  // --- home centres -------------------------------------------------------
  vie: P('Vienna', 'land', true, 'austria'),
  bud: P('Budapest', 'land', true, 'austria'),
  tri: P('Trieste', 'coast', true, 'austria'),
  lon: P('London', 'coast', true, 'england'),
  edi: P('Edinburgh', 'coast', true, 'england'),
  lvp: P('Liverpool', 'coast', true, 'england'),
  par: P('Paris', 'land', true, 'france'),
  mar: P('Marseilles', 'coast', true, 'france'),
  bre: P('Brest', 'coast', true, 'france'),
  ber: P('Berlin', 'coast', true, 'germany'),
  mun: P('Munich', 'land', true, 'germany'),
  kie: P('Kiel', 'coast', true, 'germany'),
  rom: P('Rome', 'coast', true, 'italy'),
  ven: P('Venice', 'coast', true, 'italy'),
  nap: P('Naples', 'coast', true, 'italy'),
  mos: P('Moscow', 'land', true, 'russia'),
  sev: P('Sevastopol', 'coast', true, 'russia'),
  stp: P('St Petersburg', 'coast', true, 'russia', ['nc', 'sc']),
  war: P('Warsaw', 'land', true, 'russia'),
  ank: P('Ankara', 'coast', true, 'turkey'),
  con: P('Constantinople', 'coast', true, 'turkey'),
  smy: P('Smyrna', 'coast', true, 'turkey'),

  // --- neutral centres ----------------------------------------------------
  bel: P('Belgium', 'coast', true),
  bul: P('Bulgaria', 'coast', true, undefined, ['ec', 'sc']),
  den: P('Denmark', 'coast', true),
  gre: P('Greece', 'coast', true),
  hol: P('Holland', 'coast', true),
  nwy: P('Norway', 'coast', true),
  por: P('Portugal', 'coast', true),
  rum: P('Rumania', 'coast', true),
  ser: P('Serbia', 'land', true),
  spa: P('Spain', 'coast', true, undefined, ['nc', 'sc']),
  swe: P('Sweden', 'coast', true),
  tun: P('Tunis', 'coast', true),

  // --- the rest -----------------------------------------------------------
  alb: P('Albania', 'coast'),
  apu: P('Apulia', 'coast'),
  arm: P('Armenia', 'coast'),
  boh: P('Bohemia', 'land'),
  bur: P('Burgundy', 'land'),
  cly: P('Clyde', 'coast'),
  fin: P('Finland', 'coast'),
  gal: P('Galicia', 'land'),
  gas: P('Gascony', 'coast'),
  lvn: P('Livonia', 'coast'),
  naf: P('North Africa', 'coast'),
  pic: P('Picardy', 'coast'),
  pie: P('Piedmont', 'coast'),
  pru: P('Prussia', 'coast'),
  ruh: P('Ruhr', 'land'),
  sil: P('Silesia', 'land'),
  syr: P('Syria', 'coast'),
  tus: P('Tuscany', 'coast'),
  tyr: P('Tyrolia', 'land'),
  ukr: P('Ukraine', 'land'),
  wal: P('Wales', 'coast'),
  yor: P('Yorkshire', 'coast'),
}

/** Where an army may walk. Seas do not appear. */
export const ARMY: Record<string, readonly string[]> = {
  cly: ['edi', 'lvp'],
  edi: ['cly', 'lvp', 'yor'],
  lvp: ['cly', 'edi', 'yor', 'wal'],
  yor: ['edi', 'lvp', 'wal', 'lon'],
  wal: ['lvp', 'yor', 'lon'],
  lon: ['yor', 'wal'],

  nwy: ['swe', 'fin', 'stp'],
  swe: ['nwy', 'fin', 'den'],
  fin: ['nwy', 'swe', 'stp'],
  den: ['swe', 'kie'],
  stp: ['nwy', 'fin', 'mos', 'lvn'],

  mos: ['stp', 'lvn', 'war', 'ukr', 'sev'],
  lvn: ['stp', 'mos', 'war', 'pru'],
  war: ['lvn', 'mos', 'ukr', 'gal', 'sil', 'pru'],
  ukr: ['mos', 'war', 'gal', 'rum', 'sev'],
  sev: ['mos', 'ukr', 'rum', 'arm'],

  pru: ['lvn', 'war', 'sil', 'ber'],
  ber: ['pru', 'sil', 'mun', 'kie'],
  kie: ['ber', 'mun', 'ruh', 'hol', 'den'],
  mun: ['kie', 'ber', 'sil', 'boh', 'tyr', 'bur', 'ruh'],
  ruh: ['kie', 'mun', 'bur', 'bel', 'hol'],
  sil: ['pru', 'ber', 'mun', 'boh', 'gal', 'war'],

  hol: ['kie', 'ruh', 'bel'],
  bel: ['hol', 'ruh', 'bur', 'pic'],

  pic: ['bel', 'bur', 'par', 'bre'],
  bur: ['bel', 'ruh', 'mun', 'mar', 'gas', 'par', 'pic'],
  par: ['pic', 'bur', 'gas', 'bre'],
  bre: ['pic', 'par', 'gas'],
  gas: ['bre', 'par', 'bur', 'mar', 'spa'],
  mar: ['bur', 'gas', 'spa', 'pie'],

  spa: ['gas', 'mar', 'por'],
  por: ['spa'],

  pie: ['mar', 'tyr', 'ven', 'tus'],
  tus: ['pie', 'ven', 'rom'],
  ven: ['pie', 'tyr', 'tri', 'apu', 'rom', 'tus'],
  rom: ['tus', 'ven', 'apu', 'nap'],
  nap: ['rom', 'apu'],
  apu: ['nap', 'rom', 'ven'],

  tyr: ['mun', 'boh', 'vie', 'tri', 'ven', 'pie'],
  boh: ['mun', 'sil', 'gal', 'vie', 'tyr'],
  vie: ['boh', 'gal', 'bud', 'tri', 'tyr'],
  bud: ['vie', 'gal', 'rum', 'ser', 'tri'],
  tri: ['tyr', 'vie', 'bud', 'ser', 'alb', 'ven'],
  gal: ['war', 'sil', 'boh', 'vie', 'bud', 'rum', 'ukr'],

  ser: ['tri', 'bud', 'rum', 'bul', 'gre', 'alb'],
  alb: ['tri', 'ser', 'gre'],
  gre: ['alb', 'ser', 'bul'],
  bul: ['ser', 'rum', 'con', 'gre'],
  rum: ['bud', 'gal', 'ukr', 'sev', 'bul', 'ser'],

  con: ['bul', 'ank', 'smy'],
  ank: ['con', 'smy', 'arm'],
  smy: ['con', 'ank', 'arm', 'syr'],
  arm: ['ank', 'smy', 'syr', 'sev'],
  syr: ['smy', 'arm'],

  naf: ['tun'],
  tun: ['naf'],
}

/**
 * Where a fleet may sail. Inland provinces do not appear, and the three
 * two-coasted provinces appear only under their named coasts -- a fleet is
 * never simply "in Spain".
 */
export const FLEET: Record<string, readonly string[]> = {
  // --- open water ---------------------------------------------------------
  nao: ['nwg', 'cly', 'lvp', 'iri', 'mao'],
  nwg: ['bar', 'nwy', 'nth', 'edi', 'cly', 'nao'],
  bar: ['nwg', 'nwy', 'stp/nc'],
  nth: ['nwg', 'nwy', 'ska', 'den', 'hel', 'hol', 'bel', 'lon', 'yor', 'edi', 'eng'],
  // No Baltic. The Danish straits are the only way in, which is the whole
  // reason Denmark is worth fighting over.
  ska: ['nwy', 'swe', 'den', 'nth'],
  bal: ['swe', 'den', 'kie', 'ber', 'pru', 'lvn', 'bot'],
  bot: ['swe', 'fin', 'stp/sc', 'lvn', 'bal'],
  hel: ['nth', 'den', 'kie', 'hol'],
  iri: ['nao', 'lvp', 'wal', 'eng', 'mao'],
  eng: ['iri', 'wal', 'lon', 'nth', 'bel', 'pic', 'bre', 'mao'],
  mao: ['nao', 'iri', 'eng', 'bre', 'gas', 'spa/nc', 'por', 'spa/sc', 'naf', 'wes'],
  wes: ['mao', 'spa/sc', 'lyo', 'tys', 'tun', 'naf'],
  lyo: ['spa/sc', 'mar', 'pie', 'tus', 'tys', 'wes'],
  tys: ['lyo', 'tus', 'rom', 'nap', 'ion', 'tun', 'wes'],
  ion: ['tys', 'nap', 'apu', 'adr', 'alb', 'gre', 'aeg', 'eas', 'tun'],
  adr: ['ven', 'tri', 'alb', 'ion', 'apu'],
  aeg: ['gre', 'bul/sc', 'con', 'smy', 'eas', 'ion'],
  eas: ['aeg', 'smy', 'syr', 'ion'],
  bla: ['sev', 'arm', 'ank', 'con', 'bul/ec', 'rum'],

  // --- coasts -------------------------------------------------------------
  cly: ['nao', 'nwg', 'edi', 'lvp'],
  edi: ['nwg', 'nth', 'yor', 'cly'],
  lvp: ['nao', 'iri', 'wal', 'cly'],
  yor: ['edi', 'nth', 'lon'],
  wal: ['lvp', 'iri', 'eng', 'lon'],
  lon: ['yor', 'nth', 'eng', 'wal'],

  nwy: ['nwg', 'bar', 'stp/nc', 'swe', 'ska', 'nth'],
  swe: ['nwy', 'ska', 'den', 'bal', 'bot', 'fin'],
  fin: ['swe', 'bot', 'stp/sc'],
  'stp/nc': ['bar', 'nwy'],
  'stp/sc': ['bot', 'fin', 'lvn'],
  lvn: ['bot', 'bal', 'pru', 'stp/sc'],
  pru: ['lvn', 'bal', 'ber'],
  ber: ['pru', 'bal', 'kie'],
  kie: ['ber', 'bal', 'den', 'hel', 'hol'],
  den: ['swe', 'ska', 'bal', 'kie', 'hel', 'nth'],
  hol: ['nth', 'hel', 'kie', 'bel'],
  bel: ['hol', 'nth', 'eng', 'pic'],
  pic: ['bel', 'eng', 'bre'],
  bre: ['pic', 'eng', 'mao', 'gas'],
  gas: ['bre', 'mao', 'spa/nc'],
  'spa/nc': ['gas', 'mao', 'por'],
  'spa/sc': ['por', 'mao', 'wes', 'lyo', 'mar'],
  por: ['spa/nc', 'mao', 'spa/sc'],
  mar: ['spa/sc', 'lyo', 'pie'],
  pie: ['mar', 'lyo', 'tus'],
  tus: ['pie', 'lyo', 'tys', 'rom'],
  rom: ['tus', 'tys', 'nap'],
  nap: ['rom', 'tys', 'ion', 'apu'],
  apu: ['nap', 'ion', 'adr', 'ven'],
  ven: ['apu', 'adr', 'tri'],
  tri: ['ven', 'adr', 'alb'],
  alb: ['tri', 'adr', 'ion', 'gre'],
  gre: ['alb', 'ion', 'aeg', 'bul/sc'],
  'bul/ec': ['rum', 'bla', 'con'],
  'bul/sc': ['gre', 'aeg', 'con'],
  con: ['bul/sc', 'aeg', 'smy', 'ank', 'bla', 'bul/ec'],
  smy: ['con', 'aeg', 'eas', 'syr'],
  syr: ['smy', 'eas'],
  ank: ['con', 'bla', 'arm'],
  arm: ['ank', 'bla', 'sev'],
  sev: ['arm', 'bla', 'rum'],
  rum: ['sev', 'bla', 'bul/ec'],
  naf: ['mao', 'wes', 'tun'],
  tun: ['naf', 'wes', 'tys', 'ion'],
}

/** The province a fleet key belongs to: `bul/sc` is in Bulgaria. */
export const base = (id: string): string => id.split('/')[0]!

/** Whose armies and fleets start where, in Spring 1901. */
export const OPENING: Record<Power, { armies: readonly string[]; fleets: readonly string[] }> = {
  austria: { armies: ['vie', 'bud'], fleets: ['tri'] },
  england: { armies: ['lvp'], fleets: ['lon', 'edi'] },
  france: { armies: ['par', 'mar'], fleets: ['bre'] },
  germany: { armies: ['ber', 'mun'], fleets: ['kie'] },
  italy: { armies: ['rom', 'ven'], fleets: ['nap'] },
  russia: { armies: ['mos', 'war'], fleets: ['stp/sc', 'sev'] },
  turkey: { armies: ['con', 'smy'], fleets: ['ank'] },
}

/** Eighteen of the thirty-four centres ends it. */
export const SOLO = 18
