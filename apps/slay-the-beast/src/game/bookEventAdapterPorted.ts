// Path B (real-RTP demo). Converts a math-sdk Book into the prototype's
// internal DemoEvent[] queue, plus a captured payout for the result overlay.
//
// Math-sdk emits scaled deltas tuned to land at 96% RTP per mode (e.g. fodder
// 0.0012 per kill in base, 0.02 for a big enemy). The prototype displays
// chunky $-amounts in tens-to-hundreds. We multiply by `DISPLAY_SCALE` to make
// on-screen numbers feel slot-like; RTP is preserved because everything scales
// uniformly and `chest.multiplier` is literal regardless of scale.
//
// Frame-based delays: prototype's `currentEventTimer` decrements by `dt`
// (frames at 60fps). 60 frames ≈ 1s. We pick per-variant frame budgets that
// give events time to play out without feeling sluggish.

import type { Book } from './bookSource';

// Local copy of the prototype's DemoEvent shape (imported from game.ts for
// consistency, but re-declared here so this module is purely a translator and
// doesn't reach into game internals).
export type DemoEvent = {
  type:
    | 'quiet'
    | 'speed_change'
    | 'trickle'
    | 'horde'
    | 'big_kill'
    | 'spell_attack'
    | 'potion'
    | 'powerdown'
    | 'mini_boss'
    | 'boss'
    | 'flying_dragon'
    | 'chest'
    | 'lightning_penalty'
    | 'lightning_mode'
    | 'ambush_death';
  delay: number;
  count?: number;
  killValue?: number;
  multBoost?: number;
  flavour?: 'trap' | 'thief' | 'curse';
  outcome?: 'win' | 'lose';
  bonus?: number;
  speedTier?: 'stroll' | 'run' | 'sprint';
  attackType?: 'fireball' | 'poop';
  moneyLoss?: number;
  // Lightning-specific
  scoreLoss?: number;
  scoreGain?: number;
  // spellAttack cosmetic school — the book carries it, so render it rather than
  // firing the same orange bolt for all four.
  kind?: 'arcane' | 'fire' | 'ice' | 'lightning';
  // ambushDeath flavour — drives sprite-shatter style. Two values per the
  // contract: 'spontaneous_combustion' (orange pop) and 'banana_peel' (yellow
  // upward arc).
  killerId?: 'spontaneous_combustion' | 'banana_peel' | 'dragon_snatch';
};

export const DISPLAY_SCALE = 10000;

// Round to a whole-dollar feel for floaters/HUD.
const dollarise = (raw: number): number => Math.max(0, Math.round(raw * DISPLAY_SCALE));

export type AdaptedRound = {
  hero: string;
  biome: string;
  mode: 'base' | 'ante' | 'chaos';
  /** How this round ends — drives pacing and lets the renderer stage the ending. */
  terminal: Terminal;
  /** Total delay multiplier applied to this round's beats. */
  paceScale: number;
  events: DemoEvent[];
  payout: { multiplier: number; result: 'win' | 'loss' };
};

/** How a round is already committed to ending — knowable before rendering a frame. */
export type Terminal = 'ambush' | 'boss_win' | 'boss_lose' | 'finale';

export function classifyTerminal(evs: any[]): Terminal {
  if (evs.some((e) => e.type === 'ambushDeath')) return 'ambush';
  const final = evs.find((e) => e.type === 'finalBossFight');
  if (final) return final.outcome === 'killed' ? 'boss_win' : 'boss_lose';
  if (evs.some((e) => e.type === 'miniBossFight' && e.outcome !== 'killed')) return 'boss_lose';
  return 'finale';
}

/**
 * Terminal-aware pacing. Because the book is fully pre-decided, the adapter
 * knows the ending before the first frame renders — so a doomed round can be
 * played tight and a boss-kill round can be given room to breathe.
 *
 * Rounds still vary by ending — a doomed round is tighter than a payoff round —
 * but the whole curve now sits far higher than it did. See ROUND_STRETCH.
 *
 * This is a presentation-layer decision only — no event is added, removed or
 * reordered, and no score changes. The math model is untouched.
 */
const TERMINAL_PACE: Record<Terminal, number> = {
  ambush: 1.00,     // base's common ending — carries the median
  finale: 1.05,     // fizzles need the most help to feel like a round
  boss_lose: 0.90,  // already long by event count; don't compound it
  boss_win: 0.95,   // ditto — the event count does the breathing here
};

/**
 * Global round-length multiplier.
 *
 * Measured from Drop the Boss gameplay footage (storyboard frame sampling, n=12):
 * their rounds run **10-55s, median ~30s**. Ours were running 4.4s median — their
 * median was twice our maximum. The "dead air" problem was a symptom of that: at
 * 4.4s there is no room for a build, so score had to move fast, and fast score
 * movement with no visible cause is exactly what reads as empty.
 *
 * Their answer is to take 30 seconds and fill every one of them with a named
 * micro-beat (~1 callout every 4s, ~12 animated objects on screen at all times).
 *
 * THIS CONSTANT ONLY BUYS TIME — it multiplies the GAPS BETWEEN events, not the
 * content inside them. Set to 6.0 in a first pass, which was measured to take
 * base rounds 8.0s -> 18.9s and frames-with-hero-alone 13% -> 31%: exactly
 * proportional, i.e. it bought no content whatsoever and doubled the dead air.
 *
 * Now 3.0. Measured at that value: base median 11.1s, longest empty stretch
 * ~1.2s (perceptually a beat rather than a void), still inside the benchmark's
 * 10-55s band at the low end. Raise it ONLY as ambient stage content lands —
 * length must follow density, never lead it.
 *
 * Density note: real content events per book median 4 (base), i.e. ~4.7s per
 * visible beat even at 6.0. Getting to a payout beat every ~4s at a 30s round
 * needs 7-8 content events against a current median of 4 — that IS a
 * distribution change in game_config.py and a re-sim. Cosmetic beats cannot
 * substitute (see updateCallouts).
 *
 * NOTE: game.ts divides its passive score tick by this, or a longer round
 * accrues proportionally more passive score and the on-screen number drifts
 * away from the book's payoutMultiplier.
 */
export const ROUND_STRETCH = 3.0;

export function bookToDemoEvents(book: Book): AdaptedRound {
  const evs = book.events;
  const init = evs[0];
  const last = evs[evs.length - 1];

  if (init?.type !== 'roundInit') {
    throw new Error(`bookEventAdapter: first event must be roundInit, got ${init?.type}`);
  }
  if (last?.type !== 'roundEnd') {
    throw new Error(`bookEventAdapter: last event must be roundEnd, got ${last?.type}`);
  }

  const out: DemoEvent[] = [];

  // Tiny intro beat so the round opens with the hero walking before action lands.
  out.push({ type: 'speed_change', delay: 12, speedTier: 'stroll' });
  out.push({ type: 'speed_change', delay: 8, speedTier: 'run' });

  for (const e of evs) {
    switch (e.type) {
      case 'roundInit':
      case 'roundEnd':
        // Captured out-of-band; not pushed.
        break;

      case 'quietBeat': {
        // durationMs → frames at 60fps. Min 30 frames to avoid stuttery beats.
        const f = Math.max(14, Math.round((e.durationMs ?? 500) / 16.67));
        out.push({ type: 'quiet', delay: f });
        break;
      }

      case 'speedChange':
        out.push({ type: 'speed_change', delay: 10, speedTier: e.tier });
        break;

      case 'fodderWave': {
        const isHorde = e.size === 'horde';
        const total = dollarise(e.totalScoreGain);
        const per = Math.max(1, Math.round(total / Math.max(1, e.count)));
        // Wave eats time equal to count × per-spawn pacing. Cap delay so very
        // long hordes don't stall the queue.
        const f = isHorde
          ? Math.min(95, 18 + e.count)
          : Math.min(62, 22 + Math.round(e.count * 0.8));
        out.push({
          type: isHorde ? 'horde' : 'trickle',
          delay: f,
          count: e.count,
          killValue: per,
        });
        break;
      }

      case 'bigEnemyKill':
        out.push({ type: 'big_kill', delay: 38, killValue: dollarise(e.scoreGain) });
        break;

      case 'spellAttack':
        out.push({ type: 'spell_attack', delay: 24, kind: e.kind });
        break;

      case 'potion':
        // multBoost is the absolute $ added during the buff (prototype name is
        // misleading — it's a flat boost, not a multiplier).
        out.push({
          type: 'potion',
          delay: 30,
          multBoost: dollarise(e.scoreGainDuringBuff),
        });
        break;

      case 'powerdown':
        out.push({
          type: 'powerdown',
          delay: 42,
          flavour: e.flavour,
          // The book's literal loss. Previously unthreaded, so applyPowerdown
          // hardcoded "halve the score" regardless of what the book said —
          // measured as the single largest on-screen vs book divergence
          // (+209% on base book 5). Chest already applies its multiplier
          // literally; powerdown now does the same with its delta.
          scoreLoss: dollarise(Math.abs(e.scoreDelta ?? 0)),
        });
        break;

      case 'flyingDragon':
        out.push({
          type: 'flying_dragon',
          delay: 44,
          attackType: e.attackType,
          moneyLoss: e.hit ? dollarise(e.scoreLoss) : 0,
        });
        break;

      case 'chest':
        // Literal multiplier — display-scale is uniform, so multiplier passes
        // through unchanged.
        out.push({ type: 'chest', delay: 48, bonus: e.multiplier });
        break;

      case 'lightning':
        if (e.outcome === 'penalty') {
          out.push({
            type: 'lightning_penalty',
            delay: 34,
            scoreLoss: dollarise(Math.abs(e.scoreDelta)),
          });
        } else {
          out.push({
            type: 'lightning_mode',
            delay: Math.max(40, Math.round((e.buffDurationMs ?? 1000) / 16.67)),
            scoreGain: dollarise(e.scoreGainDuringBuff),
          });
        }
        break;

      case 'miniBossFight':
        out.push({
          type: 'mini_boss',
          delay: 52,
          outcome: e.outcome === 'killed' ? 'win' : 'lose',
          bonus: e.outcome === 'killed' ? dollarise(e.scoreGain) : 0,
        });
        break;

      case 'finalBossFight':
        out.push({
          type: 'boss',
          delay: 44,
          outcome: e.outcome === 'killed' ? 'win' : 'lose',
          killValue: e.outcome === 'killed' ? dollarise(e.scoreGain) : 0,
        });
        break;

      case 'ambushDeath':
        out.push({ type: 'ambush_death', delay: 30, killerId: e.killerId });
        break;

      default:
        // Unknown variant — log and skip rather than crash the round.
        console.warn(`bookEventAdapter: skipping unknown event type "${(e as any).type}"`);
        break;
    }
  }

  // Terminal-aware pass: scale every beat by how this round is going to end,
  // then by the global stretch. Floor of 6 frames keeps the tightest beats from
  // collapsing into one frame.
  const terminal = classifyTerminal(evs);
  const pace = TERMINAL_PACE[terminal] * ROUND_STRETCH;
  for (const ev of out) {
    ev.delay = Math.max(6, Math.round(ev.delay * pace));
  }

  return {
    hero: init.heroId,
    biome: init.biomeId,
    mode: init.mode,
    terminal,
    /** Total pace multiplier applied — game.ts divides its passive tick by this. */
    paceScale: pace,
    events: out,
    payout: {
      multiplier: last.payoutMultiplier,
      result: last.result,
    },
  };
}
