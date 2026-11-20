// Token Radar's model, version radar-2: a value curve fitted to the snapshot's own live tokens,
// plus costed farm plans. No multiple is invented and no protocol name is special-cased.
//
// The value curve is a power law fitted by least squares in log space to every live-token protocol
// in the sealed snapshot that carries both a market cap and a TVL:
//
//   log(mcap_usd) = a + b * log(tvl_usd)
//
// The fit is computed at run time from the snapshot itself, so the program's two runs agree and the
// numbers below are the fit this snapshot gives, not constants carried in. A 5-fold cross-validation
// (deterministic folds, seed 42) reports the median absolute log error, so the dashboard can state
// how far the curve's predictions usually land from a live token's real market cap.
//
// Implied value for a pre-token protocol then follows from its own figures:
//
//   base         = exp(a) * tvl_usd ^ b
//   growth       = clamp(change_7d, -60, 120) per cent
//   growthMult   = 1 + (growth / 100) * 0.5
//   maturity     = 0.6 + min(age_days, 1095) / 1095 * 0.4   (age unknown: 365 days)
//   implied      = max(1, round(base * growthMult * maturity))
//
// A farm plan is costed from the same record. The deposit is sized by TVL, the hold by age, and the
// net dollars per hour follow from a stated airdrop arithmetic: 10% of the implied value is assumed
// to reach the community, one farmer's share of it is deposit / (deposit + $1,000,000 of competing
// farm capital), and the chance the token launches and the farmer qualifies is 0.35. Gas and hours
// are counted, so net $/hour is (expected gross - gas) / hours, and the verdict is Farm at $100/h
// or more, Thin from $20/h, Skip below it. The assumptions are printed in the dashboard's model
// panel, so a reader can see exactly what the verdict rests on.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted power-law curve and its backtest, computed from the snapshot's live tokens. */
export interface ModelFit {
  intercept: number;
  slope: number;
  r_squared: number;
  n_live: number;
  cv_median_log_error: number;
  cv_within_2x: number;
  cv_within_3x: number;
}

/** The model's adjustable constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  airdrop_pool_share: number;
  farm_pool_usd: number;
  launch_qualify_p: number;
  farm_threshold_usd_per_hour: number;
  thin_threshold_usd_per_hour: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  airdrop_pool_share: 0.1,
  farm_pool_usd: 1_000_000,
  launch_qualify_p: 0.35,
  farm_threshold_usd_per_hour: 100,
  thin_threshold_usd_per_hour: 20,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The cap the gate puts on an implied value, in whole dollars. */
export const IMPLIED_MAX_USD = 100_000_000_000_000;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A protocol's farm economics: deposit, gas, hours, expected net dollars per hour, verdict. */
export interface FarmEconomics {
  deposit_usd: number;
  hold_days: number;
  gas_usd: number;
  hours: number;
  expected_gross_usd: number;
  net_usd_per_hour: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    intercept: number;
    slope: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm economics for the detail view. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  deposit_usd: number;
  net_usd_per_hour: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the fitted model and its backtest. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: ModelFit;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A deterministic shuffle: a fixed seed, so the backtest folds are the same on every run. */
function shuffleSeeded<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** Least-squares log-log fit of market cap on TVL, with R squared, over the given live protocols. */
function logLogFit(rows: SnapshotProtocol[]): { a: number; b: number; r2: number } {
  const xs = rows.map((p) => Math.log(p.tvl_usd));
  const ys = rows.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { a, b, r2 };
}

/**
 * Fit the power law to the snapshot's live tokens and backtest it with 5-fold cross-validation.
 * Live means a positive market cap and a positive TVL. The folds are seeded, so the numbers are
 * the same on every run.
 */
export function fitPowerLaw(snapshot: Snapshot): ModelFit {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const { a, b, r2 } = logLogFit(live);
  const ordered = shuffleSeeded(live, 42);
  const k = 5;
  const fold = Math.floor(ordered.length / k);
  const errors: number[] = [];
  for (let f = 0; f < k; f++) {
    const test = ordered.slice(f * fold, f === k - 1 ? ordered.length : (f + 1) * fold);
    const train = [...ordered.slice(0, f * fold), ...ordered.slice(f === k - 1 ? ordered.length : (f + 1) * fold)];
    if (train.length < 2 || test.length === 0) continue;
    const ff = logLogFit(train);
    for (const p of test) {
      const predicted = ff.a + ff.b * Math.log(p.tvl_usd);
      errors.push(Math.abs(predicted - Math.log(p.mcap_usd!)));
    }
  }
  errors.sort((x, y) => x - y);
  const median = errors.length === 0 ? 0 : errors[Math.floor(errors.length / 2)]!;
  const within2 = errors.length === 0 ? 0 : errors.filter((e) => e <= Math.log(2)).length / errors.length;
  const within3 = errors.length === 0 ? 0 : errors.filter((e) => e <= Math.log(3)).length / errors.length;
  return {
    intercept: Math.round(a * 1e4) / 1e4,
    slope: Math.round(b * 1e4) / 1e4,
    r_squared: Math.round(r2 * 1e4) / 1e4,
    n_live: live.length,
    cv_median_log_error: Math.round(median * 1e3) / 1e3,
    cv_within_2x: Math.round(within2 * 1e4) / 1e4,
    cv_within_3x: Math.round(within3 * 1e4) / 1e4,
  };
}

/** The three multipliers and the implied value one protocol gets under the fitted curve. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = Math.exp(fit.intercept) * Math.pow(protocol.tvl_usd, fit.slope);
  const implied = Math.max(1, Math.min(IMPLIED_MAX_USD, Math.round(base * growthMult * maturityMult)));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** An exchange's name at the start of a protocol's name: its product, not a protocol of its own. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** A whole word that marks a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades. The rule is the watchlist's own, minus the parent-protocol
 * field the snapshot does not carry: category, version marker, wrapped word and exchange prefix.
 * A wrapped or staked product of a token that already trades is not a token that does not exist yet.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (WRAPPED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: ModelFit, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol the watchlist does not name, whatever its
  // TVL. The watchlist is a floor, never a ceiling, and the rankable set is the whole board.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, fit, model);
    return { p, implied, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const farm = farmEconomics(s.p, s.age, s.implied, model);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        intercept: fit.intercept,
        slope: fit.slope,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm,
      farm_steps: farmSteps(s.p, s.age, farm).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm economics, from its own record and its implied value. The deposit is sized by
 * TVL and the hold by age; gas is $4 to set up ($8 on a $150+ deposit) plus $2 a week; time is
 * 15 minutes to set up, 10 minutes a week and 10 minutes to claim. The expected gross assumes
 * 10% of the implied value reaches the community, one farmer's share of it is deposit /
 * (deposit + $1,000,000 of competing farm capital), and the chance the token launches and the
 * farmer qualifies is 0.35. Net dollars per hour is (expected gross - gas) / hours.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, implied: number, model: ModelConstants): FarmEconomics {
  const deposit = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = hold / 7;
  const gas = round2((deposit >= 150 ? 8 : 4) + 2 * weeks);
  const hours = round2(0.25 + (10 / 60) * weeks + 10 / 60);
  const share = deposit / (deposit + model.farm_pool_usd);
  const expectedGross = round2(implied * model.airdrop_pool_share * share * model.launch_qualify_p);
  const net = round2((expectedGross - gas) / hours);
  const verdict: 'Farm' | 'Thin' | 'Skip' =
    net >= model.farm_threshold_usd_per_hour ? 'Farm' : net >= model.thin_threshold_usd_per_hour ? 'Thin' : 'Skip';
  return { deposit_usd: deposit, hold_days: hold, gas_usd: gas, hours, expected_gross_usd: expectedGross, net_usd_per_hour: net, verdict };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age) and its farm economics, never from a
 * hand-written list of names. The first step states the deposit, the expected net dollars per hour
 * and the verdict, so the economics are in the plan itself.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, farm: FarmEconomics): FarmStep[] {
  const chain = chainOf(p);
  const capital = farm.deposit_usd;
  const hold = farm.hold_days;
  const action = actionFor(p, capital, chain);
  const verdictLine = `Farm $${capital} here: about $${farm.net_usd_per_hour}/hour net, verdict ${farm.verdict}.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. ${verdictLine}`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with farm economics for the detail view. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    deposit_usd: row.farm.deposit_usd,
    net_usd_per_hour: row.farm.net_usd_per_hour,
    verdict: row.farm.verdict,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; fit: ModelFit } {
  const fit = fitPowerLaw(snapshot);
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const totalImplied = board.reduce((s, r) => s + r.implied_value_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: totalImplied,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, fit };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > IMPLIED_MAX_USD) return `${r.slug} has implied value over the $${IMPLIED_MAX_USD} cap`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
