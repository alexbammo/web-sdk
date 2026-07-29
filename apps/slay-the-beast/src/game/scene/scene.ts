import {
  Application,
  Container,
  Sprite,
  Texture,
  Rectangle,
  Graphics,
  Text,
  TextStyle,
  Assets,
} from 'pixi.js';
import { FRAME_SIZE, SHEET_COLS, ANIM_ROWS } from './spriteData';

// ─── Constants ───────────────────────────────────────────────────────
const GAME_WIDTH = 540;
const GAME_HEIGHT = 960;
const GROUND_Y = 720;
const HERO_SCALE = 0.6075;
const ENEMY_SCALE = 0.45;
const SCROLL_SPEED_STROLL = 1.6;  // intro / quiet / ominous pre-boss
const SCROLL_SPEED_RUN = 3.2;     // default action pace
const SCROLL_SPEED_SPRINT = 4.8;  // post-potion / horde
const KILL_RANGE = 90; // enemies get smacked well before reaching hero

// Iteration harness: `?trace` logs every event as it fires, with its frame delay
// and how many remain. Pair with `?book=N` to diff two builds beat by beat.
const TRACE_EVENTS =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('trace');
/** `?finale=<flavour>` pins the round-end finale instead of picking at random. */
const FORCED_FINALE =
  typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('finale');

// Cadence tuning
// NOTE: while a wave is still spawning, `pendingWave` gates the event-queue pump
// (see update()), so this delay is dead air added on top of the event's own delay.
// At 42 a mid-size trickle stalled the round for ~1s with nothing on screen.
const TRICKLE_SPAWN_DELAY = 14;   // frames between trickle enemy clusters (ambient, loose)
const HORDE_SPAWN_DELAY = 2;      // frames between horde enemy clusters (dense, urgent)
const POTION_GROW_F = 22;
const POTION_HOLD_F = 260;  // potion buff lasts much longer so kills while big matter
const POTION_SHRINK_F = 28;
const POTION_SCALE_PEAK = 3.0;
// 4×16 sprite sheets have ~empty space below the character; sprite.anchor.set(0.5, 1)
// pivots at frame bottom, not visible feet. As container scale grows that gap
// scales with it and the character appears to lift off the ground. Push hero.y
// down by this many px per unit of scale beyond 1× to keep the feet planted.
const POTION_FOOT_ANCHOR_OFFSET = 70;
const POTION_KILL_MULT = 2;  // every fodder kill counts double while potion is active
const LIGHTNING_MODE_F = 220;       // lightning mode lasts ~3.7 seconds
const LIGHTNING_MODE_SCALE = 1.5;   // hero grows 1.5x during lightning mode
const LIGHTNING_ZAP_INTERVAL = 14;  // frames between auto-zaps while in lightning mode
const LIGHTNING_MODE_CHANCE = 0.05; // 5% roll on a lightning strike
// Passive tick: ~$10/sec at run speed. 60fps * frame = 1 sec, so 10/60 per frame.
const PASSIVE_TICK_PER_FRAME = 10 / 60;
const CHEST_BONUS = 100;  // big boost when the chest is collected
const CASTLE_FADE_F = 40;
const MINI_BOSS_LOSE_BUFFER = 34; // frames after boss reaches hero before round ends
const POWERDOWN_AIRTIME_F = 55;   // frames hero spends spinning through the air
const SCROLL_RAMP_F = 45;         // frames over which scroll speed lerps to a new target

// ─── Types ───────────────────────────────────────────────────────────
interface AnimatedEntity {
  container: Container;
  sprite: Sprite;
  textures: Record<string, Texture[]>;
  currentAnim: string;
  frameIndex: number;
  frameTimer: number;
  frameSpeed: number;
}

interface FloatingNumber {
  text: Text;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface Particle {
  // Container is the common base of Graphics + Sprite. spawnSpriteShatter uses
  // Sprite chunks; the rest of the helpers use Graphics. updateParticles only
  // touches x/y/rotation/alpha/scale/parent — all available on Container.
  gfx: Container;
  vx: number;
  vy: number;
  life: number;
  rotSpeed: number;
  // Optional GPU-resource cleanup hook. Sprite-shatter chunks use this to
  // destroy their per-chunk Sprite + ref-count down a shared RenderTexture.
  onExpire?: () => void;
}

type DeathType = 'fly_back' | 'fly_forward' | 'fly_past' | 'splat_screen';

interface DeadEnemy {
  container: Container;
  vy: number;
  vx: number;
  vz: number;
  rotSpeed: number;
  life: number;
  scaleDecay: number;
  type: DeathType;
  splatted: boolean;
  slideTimer: number;
  targetScale: number;
}

interface Projectile {
  gfx: Container;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  trailTimer: number;
}

interface Enemy {
  entity: AnimatedEntity;
  alive: boolean;
  hp: number;
  x: number;
  killValue: number;
  laneY: number;
  isFinalBoss?: boolean;
  isMiniBoss?: boolean;
  miniBossWins?: boolean; // if true, this boss walks past kill-range and ends the round
  // Boss attack cycle — periodic swap between left_walk and left_attack.
  attackTimer?: number;
  attackPhase?: 'walking' | 'attacking';
}

interface FlyingDragon {
  entity: AnimatedEntity;   // animated sheet so wings flap
  container: Container;
  sprite: Sprite;
  vx: number;
  bobTimer: number;
  dropX: number;
  hasDropped: boolean;
  attackType: 'fireball' | 'poop';
  moneyLoss: number;
  life: number;
}

interface DragonPayload {
  gfx: Container;
  x: number;
  y: number;
  vy: number;
  life: number;
  attackType: 'fireball' | 'poop';
  moneyLoss: number;
}

interface Obstacle {
  container: Container;
  kind: 'stump' | 'puddle';
  laneY: number;
  x: number;
  width: number;   // footprint on ground — used to time the hop
  triggered: boolean;
}

interface Thief {
  entity: AnimatedEntity;
  phase: 'chasing' | 'fleeing';
  grabX: number;     // x at which the thief reaches the hero and steals
  bagGfx: Graphics | null;
  moneyLoss: number;
  announced: boolean;
}

interface PotionPickup {
  container: Container;
  gfx: Graphics;
  x: number;
  y: number;
  bobTimer: number;
  multBoost: number;
  collected: boolean;
}

interface ChestPickup {
  container: Container;
  x: number;
  y: number;
  bobTimer: number;
  bonus: number;
  collected: boolean;
}

export interface GameCallbacks {
  onMultiplierChange: (value: number) => void;
  onKillCountChange: (count: number) => void;
  onStateChange: (state: 'idle' | 'playing' | 'result') => void;
  onResultData: (data: { multiplier: number; kills: number; won: boolean; heroDied: boolean }) => void;
  onFlashScreen: (color: string) => void;
}

// ─── Game Engine ─────────────────────────────────────────────────────
export class SlayTheBeastGame {
  private app: Application;
  private worldContainer!: Container;
  private splatContainer!: Container; // on top of world, for screen splats
  private uiContainer!: Container;
  private heroEntity!: AnimatedEntity;
  private enemies: Enemy[] = [];
  private floatingNumbers: FloatingNumber[] = [];
  private particles: Particle[] = [];
  private deadEnemies: DeadEnemy[] = [];
  private projectiles: Projectile[] = [];
  private callbacks: GameCallbacks;

  // Game state
  private playing = false;
  private multiplier = 0;
  private killCount = 0;
  private scrollOffset = 0;
  /** Wrapping background layers, scrolled from scrollOffset at per-layer rates. */
  private parallaxLayers: Array<{ container: Container; tile: number; rate: number }> = [];

  // Potion (hero-grow) tween
  private potionPhase: 'idle' | 'grow' | 'hold' | 'shrink' = 'idle';
  private potionTimer = 0;
  // Stacking — each potion in the same round doubles the previous peak scale.
  private potionsThisRound = 0;
  private currentPotionPeak = POTION_SCALE_PEAK;

  // Castle overlay fade
  private castleOverlay!: Graphics;
  private castleTarget = 0; // target alpha 0..1
  private castleCurrent = 0;

  // Mini-boss / final-boss loss sequence
  private pendingLoseRound = 0; // >0 means: fire endRound(false) in N frames

  // Scroll speed (smoothly lerped)
  private currentScrollSpeed = SCROLL_SPEED_STROLL;
  private targetScrollSpeed = SCROLL_SPEED_STROLL;

  // Hero airborne (powerdown launch)
  private heroAirborne = false;
  private heroAirVy = 0;
  private heroAirVx = 0;
  private heroAirRotSpeed = 0;
  private heroAirX = 0; // horizontal offset while airborne

  // Hero combat motion
  private heroBobTimer = 0;
  private heroBaseY = GROUND_Y;
  private swordSwingTimer = 0;
  private swordAnims = ['front_attack', 'right_attack', 'left_attack'];
  private swordAnimIdx = 0;

  // Demo sequence
  private eventQueue: DemoEvent[] = [];
  private currentEventTimer = 0;
  // Banked-score model: when the eventQueue runs out and there's nothing
  // active on screen (no enemies, no pending wave), wind down for ~1s and
  // then start a round-end finale (one of four cinematic flavours).
  // Handles no_boss + mini_killed terminals where the book provides no
  // explicit round-ender.
  private windDownTimer = -1;
  private finaleActive = false;
  private finaleFlavour:
    | 'dragon_carry'
    | 'gates_sealed'
    | 'sinkhole'
    | 'sword_shatter'
    | null = null;
  private finaleTimer = 0;
  private finaleEnemy: Enemy | null = null; // sword_shatter spawned enemy
  private finaleDragon: FlyingDragon | null = null; // dragon_carry mount
  private finaleCliff: Graphics | null = null; // cliff_jump chasm gfx
  private finaleHeroDying = false; // sword_shatter hero death tween
  // Whether the hero died during this round. Drives the "dead vs alive" axis
  // on the result overlay. Set true by the dead paths: ambushDeath event,
  // _updateSinkhole, _updateSwordShatter, boss-passes-hero (isInvulnerableBoss).
  // Stays false for: dragon_carry (abducted but ambiguous), gates_sealed
  // (turned back), mini_passed (banked), mini_killed (continued).
  private heroDied = false;
  // Dragon-snatch ambush treatment — a dragon stoops out of the sky and carries
  // the hero off. Distinct from the `dragon_carry` FINALE: that one is a banked,
  // ambiguous abduction at the natural end of a round; this is a hard, sudden
  // run-ender staged on the ambushDeath event. Deliberately short (~0.9s) so an
  // early death lands as a punchline rather than a cutscene.
  private snatchActive = false;
  private snatchTimer = 0;
  /**
   * Book id for the current round. Used to pick between cosmetic death
   * treatments deterministically, so `?book=N` replays identically — the
   * contract forbids runtime randomness that changes what the player sees.
   */
  private roundSeed = 0;
  /** Bet mode of the current round — drives the mode-aware finale pool. */
  private roundMode: string = 'base';
  /** Delay multiplier applied to this round; divides the passive score tick. */
  private roundPaceScale = 1;
  /** Score still to be paid out gradually — see awardScoreRamped(). */
  private rampRemaining = 0;
  private rampPerFrame = 0;
  /** Frames since the last cosmetic callout. */
  private calloutTimer = 0;
  /** Which callout comes next — walks the table deterministically, no RNG. */
  private calloutIndex = 0;
  private snatchDragon: AnimatedEntity | null = null;
  private snatchShadow: Graphics | null = null;
  private snatchHelm: Graphics | null = null;
  /** Hero x frozen at snatch start — the hero is hidden mid-sequence. */
  private snatchHeroX = 0;
  private snatchBanner = 'SNATCHED!';
  // Wounded-flinch tint countdown (frames). >0 means hero sprite is currently
  // tinted red from playWoundedFlinch(); ticks back to white when it hits 0.
  private flinchTintFrames = 0;
  // CHAOS mode atmosphere — dark sky + ambient lightning + hero glow
  private chaosGlow!: Graphics;
  private chaosGlowActive = false;
  private chaosGlowTimer = 0;
  private chaosDarkOverlay!: Graphics;
  private chaosAmbientTimer = 0;
  private chaosAmbientNext = 0;
  // Set true when the live event is a successful mini-boss kill. Cleared by
  // the next erosion-eligible event (powerdown / lightning_penalty /
  // flying_dragon), which layers a wounded flinch over its own VFX. Math-sdk
  // emits at most one erosion event per round so this flag is single-shot.
  private postMiniKillErosion = false;
  private pendingWave: { remaining: number; killValue: number; spawnDelay: number; spawnTimer: number } | null = null;

  // Asset textures
  private heroTextures: Record<string, Texture[]> = {};
  // All four hero animation sets, keyed by HeroId from the math-sdk book.
  // Populated once in loadAssets; setHero() swaps the active set per round.
  private heroTextureBank: Record<string, Record<string, Texture[]>> = {};
  private enemyTextureBank: Record<string, Texture[]>[] = [];
  // Big-enemy texture pool — four animated 4×16 sheets (dragon, cyclops,
  // demon, bear). Powers both `bigEnemyKill` events and boss roles. Index 0
  // is the dragon, used explicitly by spawnFlyingDragon and the dragon-carry
  // finale; everything else picks at random.
  private bigEnemyTextureBank: Record<string, Texture[]>[] = [];

  // Persistent money label that sits under the hero
  private heroMoneyLabel!: Text;

  // Flying dragon runtime state
  private flyingDragons: FlyingDragon[] = [];
  private dragonPayloads: DragonPayload[] = [];

  // Hero drifting lane (smooth up/down movement within play area)
  private heroLaneY = GROUND_Y;
  private heroLaneTarget = GROUND_Y;
  private heroLaneRetargetTimer = 0;

  // Obstacles + auto-hop
  private obstacles: Obstacle[] = [];
  private obstacleSpawnTimer = 260;
  private hopPhase: 'idle' | 'hopping' = 'idle';
  private hopTimer = 0;     // remaining frames in the hop
  private hopDuration = 26; // total frames for the active hop
  private hopPeak = 58;     // peak height in pixels

  // Thief runtime
  private thieves: Thief[] = [];

  // Potion runtime — floating pickup + combo label
  private potionPickups: PotionPickup[] = [];
  private potionComboLabel!: Text;
  private potionComboX = 0;
  private potionComboKills = 0;

  // Chest runtime
  private chestPickups: ChestPickup[] = [];

  // Demo round counter (alternate win/loss)
  private demoRoundNum = 0;

  // Screen shake
  private shakeIntensity = 0;
  private shakeDuration = 0;
  /** Trauma [0,1]; displacement is trauma². See updateShake(). */
  private trauma = 0;
  private shakeClock = 0;

  // Killing state
  private isKilling = false; // true when enemies are in range and hero is slashing

  // Sky atmosphere
  private skyClouds: Array<{ gfx: Graphics; x: number; y: number; w: number; speed: number }> = [];
  private birds: Array<{ gfx: Graphics; x: number; y: number; vx: number; vy: number; flapTimer: number; life: number }> = [];
  private birdSpawnTimer = 240;

  // Lightning storm clouds (event-driven) + bolt flashes.
  // Cloud drifts continuously across the screen; strikes fire at pre-chosen
  // X positions as it passes over them. One of the strikes is the "decisive"
  // pass over the hero. Outcome (penalty | lightning_mode) is PRE-ROLLED at
  // storm spawn — strike-time code is pure replay (slot determinism: all RNG
  // happens at spin/spawn, not at render time).
  private stormClouds: Array<{
    container: Container; body: Graphics;
    x: number; y: number; vx: number;
    strikes: Array<{
      triggerX: number;
      kind: 'near' | 'decisive';
      fired: boolean;
      outcome?: 'penalty' | 'lightning_mode';
    }>;
  }> = [];
  private lightningBolts: Array<{ gfx: Graphics; life: number; maxLife: number }> = [];

  // Lightning mode (5% buff roll from a strike)
  private lightningMode = false;
  private lightningModeTimer = 0;
  private lightningZapTimer = 0;
  private lightningCrackles: Array<{ gfx: Graphics; life: number }> = [];

  /** True when the PIXI.Application was supplied by the host rather than created here. */
  private ownsApp = true;
  /** Root the scene hangs off — the host's stage subtree, or app.stage standalone. */
  private root!: Container;

  constructor(callbacks: GameCallbacks) {
    this.app = new Application();
    this.callbacks = callbacks;
  }

  /**
   * Attach the scene to an Application the HOST already created.
   *
   * The submission app renders through pixi-svelte, which owns the
   * PIXI.Application (exposed as `stateApp.pixiApplication`) and drives layout
   * and reflow through MainContainer. Creating a second Application here would
   * mean two canvases, two tickers and no reflow — so the port attaches to the
   * existing one instead and hangs its three containers off a supplied root.
   *
   * `mountRoot` is the container the scene's own layers are added to, so the
   * host keeps control of where the scene sits in its display list.
   */
  async attach(app: Application, mountRoot?: Container) {
    this.app = app;
    this.ownsApp = false;
    await this._build(mountRoot ?? app.stage);
  }

  async init(canvas: HTMLCanvasElement) {
    await this.app.init({
      canvas,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: 0x87CEEB,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    this.ownsApp = true;
    await this._build(this.app.stage);
  }

  private async _build(root: Container) {
    this.root = root;
    this.worldContainer = new Container();
    // Pivot at centre so shake ROTATION swings about the middle of the frame
    // rather than the top-left corner. Position compensates, so the transform is
    // identity at rest and every existing world coordinate stays valid.
    this.worldContainer.pivot.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.worldContainer.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.root.addChild(this.worldContainer);

    // Splat container sits between world and UI — splats render on top of everything in-world
    this.splatContainer = new Container();
    this.root.addChild(this.splatContainer);

    this.uiContainer = new Container();
    this.root.addChild(this.uiContainer);

    await this.loadAssets();
    this.buildBackground();
    this.buildHero();
    this.buildHeroMoneyLabel();
    this.buildPotionComboLabel();

    // Held so detach() can remove it — when the host owns the Application, the
    // ticker outlives this scene and an orphaned callback would keep running
    // against destroyed containers.
    this._tick = () => this.update(this.app.ticker.deltaTime);
    this.app.ticker.add(this._tick);

    // Debug-only: press K to fire a sprite-shatter on the live hero.
    this._onDebugKey = (e: KeyboardEvent) => {
      if (e.key !== 'k' && e.key !== 'K') return;
      if (!this.heroEntity) return;
      this.spawnSpriteShatter(this.heroEntity.container);
      this.heroEntity.container.visible = false;
    };
    window.addEventListener('keydown', this._onDebugKey);
  }

  private _tick?: () => void;
  private _onDebugKey?: (e: KeyboardEvent) => void;

  /**
   * Tear the scene down without touching the host's Application.
   *
   * destroy() below calls app.destroy(), which is correct standalone but would
   * kill the host's renderer when embedded. Anything mounted into a host must
   * use this instead.
   */
  detach() {
    if (this._tick) this.app.ticker.remove(this._tick);
    if (this._onDebugKey) window.removeEventListener('keydown', this._onDebugKey);
    for (const c of [this.worldContainer, this.splatContainer, this.uiContainer]) {
      c?.parent?.removeChild(c);
      c?.destroy({ children: true });
    }
  }

  // ─── Asset Loading ──────────────────────────────────────────
  private async loadAssets() {
    // Load all four playable heroes upfront. The math-sdk book emits one of
    // these in roundInit.heroId; setHero() swaps the active set at round start.
    const heroIds = ['male_warrior', 'male_knight', 'male_thief', 'male_wizard'];
    const heroSheets = await Promise.all(
      heroIds.map((id) => Assets.load(`/assets/heroes/${id}.png`)),
    );
    for (let i = 0; i < heroIds.length; i++) {
      this.heroTextureBank[heroIds[i]] = this.buildAnimTextures(heroSheets[i]);
    }
    this.heroTextures = this.heroTextureBank['male_warrior']; // default until first setHero

    for (let i = 1; i <= 8; i++) {
      const tex = await Assets.load(`/assets/enemies/fodder/monster_${String(i).padStart(2, '0')}.png`);
      this.enemyTextureBank.push(this.buildAnimTextures(tex));
    }

    // Big-enemy sprite pool — four 4×16 animated sheets. Drives both the
    // mid-round `bigEnemyKill` events and the (now-animated) boss roles.
    // Order matters: dragon at index 0 is reused by spawnFlyingDragon and
    // the dragon-carry finale, so the silhouette reads correctly.
    const bigSheets = await Promise.all([
      Assets.load('/assets/enemies/big/dragon.png'),
      Assets.load('/assets/enemies/big/cyclops.png'),
      Assets.load('/assets/enemies/big/demon.png'),
      Assets.load('/assets/enemies/big/bear.png'),
    ]);
    this.bigEnemyTextureBank = bigSheets.map((tex) => this.buildAnimTextures(tex));
  }

  // Pick a random big-enemy texture set (dragon / cyclops / demon / bear).
  private pickBigEnemyTextures(): Record<string, Texture[]> {
    return this.bigEnemyTextureBank[
      Math.floor(Math.random() * this.bigEnemyTextureBank.length)
    ];
  }

  // Wraps a single texture so it slots into the AnimatedEntity shape — every
  // "animation" row points at the same frame, so updateAnimation becomes a no-op
  // (it skips when frames.length <= 1) and the sprite just stays on that still.
  private buildStillEntityTextures(tex: Texture): Record<string, Texture[]> {
    const names = [
      'right_idle', 'right_walk', 'right_attack',
      'left_idle', 'left_walk', 'left_attack',
      'front_idle', 'front_walk', 'front_attack',
      'back_idle', 'back_walk',
    ];
    const result: Record<string, Texture[]> = {};
    for (const n of names) result[n] = [tex];
    return result;
  }

  private buildAnimTextures(baseTex: Texture): Record<string, Texture[]> {
    const result: Record<string, Texture[]> = {};
    const rows: Record<string, number> = {
      right_idle: ANIM_ROWS.RIGHT_IDLE,
      right_walk: ANIM_ROWS.RIGHT_WALK,
      right_attack: ANIM_ROWS.RIGHT_ATTACK,
      left_idle: ANIM_ROWS.LEFT_IDLE,
      left_walk: ANIM_ROWS.LEFT_WALK,
      left_attack: ANIM_ROWS.LEFT_ATTACK,
      front_idle: ANIM_ROWS.FRONT_IDLE,
      front_walk: ANIM_ROWS.FRONT_WALK,
      front_attack: ANIM_ROWS.FRONT_ATTACK,
      back_idle: ANIM_ROWS.BACK_IDLE,
      back_walk: ANIM_ROWS.BACK_WALK,
    };

    for (const [name, row] of Object.entries(rows)) {
      result[name] = [];
      for (let col = 0; col < SHEET_COLS; col++) {
        const frame = new Rectangle(col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
        result[name].push(new Texture({ source: baseTex.source, frame }));
      }
    }
    return result;
  }

  /**
   * Builds a horizontally-wrapping parallax layer. The painter draws one tile's
   * worth of content into a Graphics; two copies are placed side by side so the
   * seam is always off-screen as the container scrolls. Content must stay inside
   * [0, tile) or it will clip at the wrap.
   */
  private makeParallaxLayer(paint: (g: Graphics) => void, tile: number, rate: number) {
    const layer = new Container();
    for (let i = 0; i < 2; i++) {
      const g = new Graphics();
      paint(g);
      g.x = i * tile;
      layer.addChild(g);
    }
    this.worldContainer.addChild(layer);
    this.parallaxLayers.push({ container: layer, tile, rate });
  }

  private buildParallaxLayers() {
    const T = GAME_WIDTH;

    // NOTE ON SEAMS: content must stay inside [rx, T - rx] or it bleeds past the
    // tile edge, where the second copy overdraws it — with alpha < 1 that shows
    // as a darker vertical band scrolling past once per tile.
    const clamp = (x: number, rx: number) => Math.max(rx, Math.min(T - rx, x));

    // Far ridge — slowest, most washed out. Sits above the horizon haze.
    this.makeParallaxLayer((g) => {
      const rx = 74;
      for (let i = 0; i < 7; i++) {
        g.ellipse(clamp(28 + i * 78, rx), GROUND_Y - 150, rx, 44 + Math.sin(i * 1.3) * 16);
      }
      g.fill({ color: 0x24461a, alpha: 0.30 });
    }, T, 0.12);

    // Mid treeline — reads as a band of foliage tops.
    this.makeParallaxLayer((g) => {
      const rx = 44;
      for (let i = 0; i < 9; i++) {
        const h = 34 + Math.sin(i * 2.1) * 12;
        g.ellipse(clamp(46 + i * 56, rx), GROUND_Y - 96, rx, h);
      }
      g.fill({ color: 0x2f6322, alpha: 0.55 });
    }, T, 0.32);

    // Near shrubs. Raised well clear of the hero's foot line — at GROUND_Y - 44
    // they read as being IN his lane rather than behind him.
    this.makeParallaxLayer((g) => {
      const rx = 30;
      for (let i = 0; i < 6; i++) {
        const x = clamp(48 + i * 92, rx + 20);
        g.ellipse(x, GROUND_Y - 96, rx, 22);
        g.ellipse(x + 20, GROUND_Y - 88, 20, 15);
      }
      g.fill({ color: 0x3c7a28, alpha: 0.85 });
    }, T, 0.68);

    // Ground detail — full scroll rate, so the floor visibly rushes past.
    this.makeParallaxLayer((g) => {
      for (let i = 0; i < 26; i++) {
        const x = (i * 97) % (T - 24);
        const y = GROUND_Y + 6 + ((i * 53) % 120);
        g.rect(x, y, 9 + ((i * 7) % 14), 2);
      }
      g.fill({ color: 0x6b431d, alpha: 0.5 });
      for (let i = 0; i < 14; i++) {
        const x = (i * 141) % (T - 20);
        g.rect(x, GROUND_Y - 16 + ((i * 31) % 12), 12 + ((i * 5) % 10), 2);
      }
      g.fill({ color: 0x5a8a3e, alpha: 0.45 });
    }, T, 1.0);
  }

  private updateParallax() {
    for (const l of this.parallaxLayers) {
      // Modulo keeps the container within one tile of origin regardless of run length.
      l.container.x = -((this.scrollOffset * l.rate) % l.tile);
    }
  }

  // ─── Background ─────────────────────────────────────────────
  private buildBackground() {
    const sky = new Graphics();
    sky.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    sky.fill(0x87CEEB);
    this.worldContainer.addChild(sky);

    const hills = new Graphics();
    for (let i = 0; i < 20; i++) {
      const x = i * 120;
      const h = 50 + Math.sin(i * 0.7) * 25;
      hills.ellipse(x, GROUND_Y - 100, 80, h);
    }
    hills.fill({ color: 0x2d5a1e, alpha: 0.4 });
    this.worldContainer.addChild(hills);

    const midGround = new Graphics();
    midGround.rect(0, GROUND_Y - 80, GAME_WIDTH * 3, 160);
    midGround.fill(0x5a9a3e);
    this.worldContainer.addChild(midGround);

    const ground = new Graphics();
    // Top grass strip (under the hero's path)
    ground.rect(0, GROUND_Y - 20, GAME_WIDTH * 3, 30);
    ground.fill(0x4a7a2e);
    // Brown dirt fading to near-black below the grass line
    const dirtBands: Array<[number, number]> = [
      [10, 0x7a4a20],
      [40, 0x5a3518],
      [80, 0x3e2410],
      [140, 0x22140a],
      [220, 0x0e0805],
    ];
    for (let i = 0; i < dirtBands.length; i++) {
      const [startOffset, color] = dirtBands[i];
      const nextOffset = i + 1 < dirtBands.length ? dirtBands[i + 1][0] : GAME_HEIGHT - GROUND_Y + 40;
      ground.rect(0, GROUND_Y + startOffset, GAME_WIDTH * 3, nextOffset - startOffset);
      ground.fill(color);
    }
    this.worldContainer.addChild(ground);

    const path = new Graphics();
    path.rect(0, GROUND_Y - 5, GAME_WIDTH * 3, 10);
    path.fill({ color: 0x8B7355, alpha: 0.4 });
    this.worldContainer.addChild(path);

    const groundLines = new Graphics();
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * GAME_WIDTH * 2;
      const y = GROUND_Y - 70 + Math.random() * 130;
      groundLines.rect(x, y, 10 + Math.random() * 15, 2);
      groundLines.fill({ color: 0x5a8a3e, alpha: 0.3 });
    }
    this.worldContainer.addChild(groundLines);

    // Parallax. Until now every background layer was static and the only sense of
    // motion came from spawned objects sliding left — which is why the scene read
    // flat during quiet beats. scrollOffset was already being accumulated and
    // never read; these layers consume it at different rates for depth.
    this.buildParallaxLayers();

    // CHAOS dark overlay — covers the full scene with a foreboding dark tint
    this.chaosDarkOverlay = new Graphics();
    this.chaosDarkOverlay.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.chaosDarkOverlay.fill({ color: 0x0a0820, alpha: 0.55 });
    this.chaosDarkOverlay.visible = false;
    this.worldContainer.addChild(this.chaosDarkOverlay);

    // Castle backdrop overlay — hidden until a mini-boss fight, then fades in
    this.castleOverlay = this.buildCastleOverlay();
    this.castleOverlay.alpha = 0;
    this.worldContainer.addChild(this.castleOverlay);

    // Sky atmosphere — drifting clouds (always present, parallax-slow)
    this.buildSkyClouds();
  }

  // ─── Sky Clouds ─────────────────────────────────────────────
  private buildSkyClouds() {
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = 30 + Math.random() * (GROUND_Y - 260);
      const w = 70 + Math.random() * 70;
      this.spawnSkyCloud(x, y, w, 0.25 + Math.random() * 0.25);
    }
  }

  private spawnSkyCloud(x: number, y: number, w: number, speed: number) {
    const gfx = new Graphics();
    // Three overlapping puffs
    const puffs = 3 + Math.floor(Math.random() * 2);
    for (let j = 0; j < puffs; j++) {
      const px = (j - (puffs - 1) / 2) * (w * 0.35);
      const py = (Math.random() - 0.5) * 8;
      const r = w * (0.32 + Math.random() * 0.12);
      gfx.ellipse(px, py, r, r * 0.65);
    }
    gfx.fill({ color: 0xFFFFFF, alpha: 0.85 });
    gfx.x = x;
    gfx.y = y;
    this.worldContainer.addChild(gfx);
    this.skyClouds.push({ gfx, x, y, w, speed });
  }

  private updateSkyClouds(dt: number) {
    for (const c of this.skyClouds) {
      c.x -= c.speed * dt;
      if (c.x < -c.w - 40) {
        c.x = GAME_WIDTH + c.w + Math.random() * 80;
        c.y = 30 + Math.random() * (GROUND_Y - 260);
      }
      c.gfx.x = c.x;
      c.gfx.y = c.y;
    }
  }

  // ─── Birds (procedural silhouette flock) ────────────────────
  private maybeSpawnBird(dt: number) {
    this.birdSpawnTimer -= dt;
    if (this.birdSpawnTimer > 0) return;
    this.birdSpawnTimer = 240 + Math.random() * 360;
    // Spawn a small flock of 2-4 birds at varied offsets
    const flock = 2 + Math.floor(Math.random() * 3);
    const baseY = 40 + Math.random() * (GROUND_Y - 320);
    for (let i = 0; i < flock; i++) {
      const gfx = new Graphics();
      this.drawBirdFrame(gfx, 0);
      gfx.x = GAME_WIDTH + 40 + i * 35;
      gfx.y = baseY + (Math.random() - 0.5) * 30;
      this.worldContainer.addChild(gfx);
      this.birds.push({
        gfx, x: gfx.x, y: gfx.y,
        vx: -0.9 - Math.random() * 0.5,
        vy: -0.03 - Math.random() * 0.04,
        flapTimer: Math.random() * 20,
        life: 900,
      });
    }
  }

  private drawBirdFrame(gfx: Graphics, flap: number) {
    gfx.clear();
    // Two arc wings that flap: flap ranges 0..1 (0 = down, 1 = up)
    const spread = 10;
    const lift = -4 + flap * 6;
    gfx.moveTo(-spread, 0);
    gfx.quadraticCurveTo(-spread * 0.5, lift, 0, 0);
    gfx.quadraticCurveTo(spread * 0.5, lift, spread, 0);
    gfx.stroke({ color: 0x222222, width: 2 });
  }

  private updateBirds(dt: number) {
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.flapTimer += dt;
      b.life -= dt;
      const flap = (Math.sin(b.flapTimer * 0.25) + 1) / 2;
      this.drawBirdFrame(b.gfx, flap);
      b.gfx.x = b.x;
      b.gfx.y = b.y;
      if (b.x < -40 || b.life <= 0) {
        this.worldContainer.removeChild(b.gfx);
        this.birds.splice(i, 1);
      }
    }
  }

  private buildCastleOverlay(): Graphics {
    const g = new Graphics();
    // Dusk sky tint over the whole scene
    g.rect(0, 0, GAME_WIDTH, GROUND_Y - 20);
    g.fill({ color: 0x2a1a3a, alpha: 0.55 });
    // Dark horizon band
    g.rect(0, GROUND_Y - 160, GAME_WIDTH, 60);
    g.fill({ color: 0x1a0a20, alpha: 0.6 });

    // Main keep (centered, behind boss) — base sits at ground level
    const cx = GAME_WIDTH * 0.72;
    const keepBase = GROUND_Y - 20;
    g.rect(cx - 90, keepBase - 170, 180, 170);
    g.fill(0x18111f);
    // Central tower
    g.rect(cx - 25, keepBase - 240, 50, 70);
    g.fill(0x18111f);
    // Left + right turrets
    g.rect(cx - 110, keepBase - 210, 40, 210);
    g.fill(0x18111f);
    g.rect(cx + 70, keepBase - 210, 40, 210);
    g.fill(0x18111f);
    // Battlements (crenellations) on turrets
    for (let i = 0; i < 3; i++) {
      g.rect(cx - 108 + i * 14, keepBase - 222, 8, 14);
      g.fill(0x18111f);
      g.rect(cx + 72 + i * 14, keepBase - 222, 8, 14);
      g.fill(0x18111f);
    }
    // Tower cap / flag
    g.moveTo(cx - 2, keepBase - 240);
    g.lineTo(cx - 2, keepBase - 270);
    g.lineTo(cx + 22, keepBase - 260);
    g.lineTo(cx - 2, keepBase - 250);
    g.fill(0x6a1a1a);
    // Gate
    g.rect(cx - 18, keepBase - 60, 36, 60);
    g.fill(0x0a0510);
    // Glowing windows
    for (const [wx, wy] of [[cx - 60, keepBase - 110], [cx + 50, keepBase - 110], [cx - 5, keepBase - 205]]) {
      g.rect(wx, wy, 10, 14);
      g.fill({ color: 0xffaa33, alpha: 0.9 });
    }

    // Distant secondary tower
    g.rect(cx - 260, keepBase - 140, 30, 140);
    g.fill(0x120a18);
    g.rect(cx - 268, keepBase - 150, 46, 14);
    g.fill(0x120a18);

    return g;
  }

  // ─── Hero ───────────────────────────────────────────────────
  private buildHero() {
    const entity = this.createAnimatedEntity(this.heroTextures, HERO_SCALE, true);
    entity.container.x = 160;
    entity.container.y = GROUND_Y;
    entity.frameSpeed = 5;
    this.worldContainer.addChild(entity.container);
    this.heroEntity = entity;
    this.heroBaseY = GROUND_Y;
    this.setAnimation(entity, 'front_idle');

    // CHAOS glow placeholder (hidden — atmosphere handles the CHAOS visual)
    this.chaosGlow = new Graphics();
    this.chaosGlow.visible = false;
  }

  // ─── Hero Money Label ───────────────────────────────────────
  // Persistent "$N.N" tag that lives under the hero's feet while playing.
  private buildHeroMoneyLabel() {
    const style = new TextStyle({
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: 20,
      fontWeight: 'bold',
      fill: 0xFFD700,
      stroke: { color: 0x000000, width: 4 },
      dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.8 },
    });
    this.heroMoneyLabel = new Text({ text: '$0.0', style });
    this.heroMoneyLabel.anchor.set(0.5, 0);
    this.heroMoneyLabel.visible = false;
    this.uiContainer.addChild(this.heroMoneyLabel);
  }

  private updateHeroMoneyLabel() {
    if (!this.playing) {
      this.heroMoneyLabel.visible = false;
      return;
    }
    this.heroMoneyLabel.visible = true;
    this.heroMoneyLabel.text = `$${this.multiplier.toFixed(1)}`;
    // Anchor to hero's base screen position (fixed x=160, ground y), not the
    // airborne/bobbing transform — so it reads like a shadow label on the ground.
    this.heroMoneyLabel.x = 160;
    this.heroMoneyLabel.y = this.heroBaseY + 10;
  }

  // ─── Entity Helpers ─────────────────────────────────────────
  private createAnimatedEntity(
    textures: Record<string, Texture[]>,
    scale: number,
    flipX = false
  ): AnimatedEntity {
    const container = new Container();
    const firstAnim = textures['front_idle'] || textures['left_idle'] || textures['right_idle'];
    const sprite = new Sprite(firstAnim?.[0]);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(flipX ? -scale : scale, scale);
    container.addChild(sprite);

    return {
      container, sprite, textures,
      currentAnim: 'front_idle',
      frameIndex: 0, frameTimer: 0, frameSpeed: 10,
    };
  }

  private setAnimation(entity: AnimatedEntity, animName: string) {
    if (entity.currentAnim === animName) return;
    if (!entity.textures[animName]) return;
    entity.currentAnim = animName;
    entity.frameIndex = 0;
    entity.frameTimer = 0;
    entity.sprite.texture = entity.textures[animName][0];
  }

  private forceFrame(entity: AnimatedEntity, animName: string, frame: number) {
    if (!entity.textures[animName]) return;
    entity.currentAnim = animName;
    entity.frameIndex = frame % entity.textures[animName].length;
    entity.sprite.texture = entity.textures[animName][entity.frameIndex];
  }

  private updateAnimation(entity: AnimatedEntity, dt: number) {
    const frames = entity.textures[entity.currentAnim];
    if (!frames || frames.length <= 1) return;
    entity.frameTimer += dt;
    if (entity.frameTimer >= entity.frameSpeed) {
      entity.frameTimer = 0;
      entity.frameIndex = (entity.frameIndex + 1) % frames.length;
      entity.sprite.texture = frames[entity.frameIndex];
    }
  }

  // ─── Hero Vertical Lane Drift ───────────────────────────────
  // Hero glides up and down the play area to intercept enemies / attackers.
  // Picks a fresh target lane every few seconds, biased toward the nearest
  // incoming enemy so fights feel choreographed rather than on rails.
  private updateHeroLane(dt: number) {
    if (!this.playing || this.heroAirborne || this.hopPhase !== 'idle') return;

    // Giant hero pins to the bottom lane — reads clearer and keeps his huge
    // silhouette anchored so the potion buff feels grounded.
    const potionActive = this.potionPhase === 'grow' || this.potionPhase === 'hold';
    if (potionActive) {
      this.heroLaneTarget = GROUND_Y + 35;
      this.heroLaneY += (this.heroLaneTarget - this.heroLaneY) * 0.08 * dt;
      this.heroBaseY = this.heroLaneY;
      return;
    }

    this.heroLaneRetargetTimer -= dt;
    if (this.heroLaneRetargetTimer <= 0) {
      // Find the closest enemy in front of the hero (within 500 px)
      const heroX = this.heroEntity.container.x;
      let nearestY: number | null = null;
      let nearestDx = Infinity;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = e.entity.container.x - heroX;
        if (dx > 20 && dx < 500 && dx < nearestDx) {
          nearestDx = dx;
          nearestY = e.laneY;
        }
      }
      // Bias toward the nearest enemy's lane but keep drift gentle — hero
      // should nudge up or down, not pogo around the screen.
      if (nearestY !== null) {
        this.heroLaneTarget = nearestY + (Math.random() - 0.5) * 25;
      } else {
        this.heroLaneTarget = GROUND_Y + (Math.random() - 0.5) * 60;
      }
      // Keep within a narrow band around the path
      this.heroLaneTarget = Math.max(GROUND_Y - 35, Math.min(GROUND_Y + 35, this.heroLaneTarget));
      this.heroLaneRetargetTimer = 110 + Math.random() * 90;
    }

    // Smooth lerp — slow so the drift reads as subtle sway
    this.heroLaneY += (this.heroLaneTarget - this.heroLaneY) * 0.03 * dt;
    this.heroBaseY = this.heroLaneY;
  }

  // ─── Obstacles (tree stumps, rivers) ────────────────────────
  private spawnObstacle() {
    const kind: 'stump' | 'puddle' = Math.random() < 0.5 ? 'stump' : 'puddle';
    const container = new Container();
    let width = 0;
    // Puddles can sit anywhere across the lane band; stumps stay on the ground line
    const laneOffset = kind === 'puddle' ? (Math.random() - 0.5) * 60 : 0;
    const containerY = GROUND_Y + 4 + laneOffset;
    if (kind === 'stump') {
      width = 50;
      // Chunky stump silhouette
      const trunk = new Graphics();
      trunk.rect(-width / 2, -28, width, 28);
      trunk.fill(0x6b4222);
      const rings = new Graphics();
      rings.ellipse(0, -28, width / 2, 9);
      rings.fill(0x865c30);
      rings.ellipse(0, -28, width / 2 - 7, 6);
      rings.fill(0x5a3318);
      const base = new Graphics();
      base.ellipse(0, 0, width / 2 + 4, 7);
      base.fill({ color: 0x2a1a08, alpha: 0.55 });
      container.addChild(base, trunk, rings);
    } else {
      // Small puddle — ellipse on the ground at a random lane offset. Hero
      // only hops if he's in the puddle's lane band; otherwise he just strolls past it.
      width = 70;
      const ry = 10;

      // Damp ring (darker ground halo)
      const damp = new Graphics();
      damp.ellipse(0, 0, width / 2 + 6, ry + 4);
      damp.fill({ color: 0x2a2a10, alpha: 0.35 });
      // Water body
      const water = new Graphics();
      water.ellipse(0, 0, width / 2, ry);
      water.fill(0x2e6fb3);
      // Depth
      const deep = new Graphics();
      deep.ellipse(0, 1, width / 2 - 6, ry - 3);
      deep.fill({ color: 0x1a4d82, alpha: 0.6 });
      // Shimmer highlights
      const shimmer = new Graphics();
      shimmer.ellipse(-width / 4, -2, 10, 2);
      shimmer.ellipse(width / 6, 1, 8, 2);
      shimmer.fill({ color: 0x9fd4ff, alpha: 0.8 });
      container.addChild(damp, water, deep, shimmer);
    }
    container.x = GAME_WIDTH + 140;
    container.y = containerY;
    this.worldContainer.addChild(container);

    this.obstacles.push({ container, kind, laneY: containerY, x: container.x, width, triggered: false });
  }

  private updateObstacles(dt: number) {
    if (!this.playing) return;

    this.obstacleSpawnTimer -= dt;
    if (this.obstacleSpawnTimer <= 0) {
      this.spawnObstacle();
      // Leave plenty of room between obstacles so they're decoration, not a minefield
      this.obstacleSpawnTimer = 220 + Math.random() * 220;
    }

    const heroX = this.heroEntity.container.x;
    const moveSpeed = this.currentScrollSpeed + 1.0;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const ob = this.obstacles[i];
      ob.container.x -= moveSpeed * dt;
      ob.x = ob.container.x;

      // Trigger a hop when the obstacle's right edge is about to reach the hero.
      // Puddles only trigger if the hero is running through the same lane band.
      if (!ob.triggered && ob.x - ob.width / 2 <= heroX + 50) {
        ob.triggered = true;
        const inLane = ob.kind === 'stump' || Math.abs(this.heroLaneY - ob.laneY) < 28;
        if (inLane && this.hopPhase === 'idle' && !this.heroAirborne) {
          this.hopPhase = 'hopping';
          this.hopDuration = ob.kind === 'puddle' ? 26 : 24;
          this.hopPeak = ob.kind === 'puddle' ? 60 : 54;
          this.hopTimer = this.hopDuration;
        }
      }

      if (ob.x < -120) {
        ob.container.parent?.removeChild(ob.container);
        this.obstacles.splice(i, 1);
      }
    }
  }

  private updateHeroHop(dt: number) {
    if (this.hopPhase === 'idle' || this.heroAirborne) return;
    this.hopTimer -= dt;

    const t = Math.max(0, Math.min(1, 1 - this.hopTimer / this.hopDuration));
    const offset = -Math.sin(t * Math.PI) * this.hopPeak;
    this.heroEntity.container.y = this.heroBaseY + offset;
    this.heroEntity.container.rotation = Math.sin(t * Math.PI) * 0.12;

    if (this.hopTimer <= 0) {
      this.hopPhase = 'idle';
      this.heroEntity.container.y = this.heroBaseY;
      this.heroEntity.container.rotation = 0;
      this.spawnDeathParticles(this.heroEntity.container.x, this.heroBaseY - 6, 4);
    }
  }

  // ─── Hero Combat Motion ─────────────────────────────────────
  private updateHeroCombat(dt: number) {
    if (!this.playing) return;
    if (this.heroAirborne) return; // airborne physics owns hero transform
    if (this.hopPhase !== 'idle') return; // hop owns hero transform

    // Bob up and down while fighting
    this.heroBobTimer += dt * 0.4;
    const bobAmount = this.isKilling ? 12 : 4;
    const bobSpeed = this.isKilling ? 2.5 : 1.2;
    this.heroEntity.container.y = this.heroBaseY + Math.sin(this.heroBobTimer * bobSpeed) * bobAmount;

    if (this.isKilling) {
      // Swing sword madly — rapidly cycle through attack animations
      this.swordSwingTimer += dt;
      if (this.swordSwingTimer >= 3) { // swap every 3 frames
        this.swordSwingTimer = 0;
        this.swordAnimIdx = (this.swordAnimIdx + 1) % this.swordAnims.length;
        const anim = this.swordAnims[this.swordAnimIdx];
        // Force a random frame within the attack anim for frantic feel
        this.forceFrame(this.heroEntity, anim, Math.floor(Math.random() * SHEET_COLS));
      }
    }
  }

  // ─── Enemy Spawning ─────────────────────────────────────────
  private spawnEnemy(x: number): Enemy {
    const bankIdx = Math.floor(Math.random() * this.enemyTextureBank.length);
    const textures = this.enemyTextureBank[bankIdx];
    const entity = this.createAnimatedEntity(textures, ENEMY_SCALE);

    const laneY = GROUND_Y - 60 + Math.random() * 120;
    entity.container.x = x;
    entity.container.y = laneY;
    entity.frameSpeed = 8 + Math.random() * 4;

    const depthScale = 0.85 + (laneY - (GROUND_Y - 60)) / 200 * 0.3;
    let finalScale = ENEMY_SCALE * depthScale;

    // 5% chance to be a large variant
    if (Math.random() < 0.05) {
      finalScale *= 1.8 + Math.random() * 0.7; // 1.8-2.5x bigger
      entity.sprite.tint = 0xCC4466; // dark red-purple tint
    }

    entity.sprite.scale.set(-finalScale, finalScale);

    this.setAnimation(entity, 'left_walk');
    this.worldContainer.addChild(entity.container);
    this.worldContainer.sortChildren();

    return { entity, alive: true, hp: 1, x, killValue: 0.2, laneY };
  }

  // ─── Spawn Big Enemy (uses big sprite, not fodder) ──────────
  private spawnBigEnemy(x: number, scale: number, tint: number): Enemy {
    const entity = this.createAnimatedEntity(this.pickBigEnemyTextures(), scale, true);

    const laneY = GROUND_Y;
    entity.container.x = x;
    entity.container.y = laneY;
    entity.frameSpeed = 6;
    entity.sprite.tint = tint;

    this.setAnimation(entity, 'left_walk');
    this.worldContainer.addChild(entity.container);
    this.worldContainer.sortChildren();

    return { entity, alive: true, hp: 1, x, killValue: 2.0, laneY };
  }

  // ─── Spawn Boss (animated big-enemy at large scale) ───────────
  // Promoted to use the big-enemy 4×16 sheet pool so bosses now walk and
  // animate. desiredHeight is a target visual height; we derive a scale
  // factor from it relative to the frame size.
  private spawnBossEnemy(x: number, desiredHeight: number): Enemy {
    const textures = this.pickBigEnemyTextures();
    // Frames are 512px tall (FRAME_SIZE); the visible character occupies ~70%
    // of that vertically. Scale factor target: desiredHeight / (FRAME_SIZE * 0.7).
    const scl = desiredHeight / (512 * 0.7);
    const entity = this.createAnimatedEntity(textures, scl, true);

    const laneY = GROUND_Y;
    entity.container.x = x;
    entity.container.y = laneY;
    entity.frameSpeed = 5;

    this.setAnimation(entity, 'left_walk');
    this.worldContainer.addChild(entity.container);
    this.worldContainer.sortChildren();

    return {
      entity, alive: true, hp: 1, x, killValue: 0, laneY,
      // Stagger initial attacks so multiple bosses (or boss + dragon swoop)
      // don't synchronise. Walk cycle 50f → attack 18f → repeat.
      attackTimer: 30 + Math.random() * 30,
      attackPhase: 'walking',
    };
  }

  // ─── Pick Death Direction ───────────────────────────────────
  private pickDeathType(): DeathType {
    const roll = Math.random();
    if (roll < 0.05) return 'splat_screen';    // 5%  — fly toward camera, splat
    if (roll < 0.15) return 'fly_past';        // 10% — fly past hero to the left
    if (roll < 0.30) return 'fly_forward';     // 15% — fly back the way they came (right), arc up over others
    return 'fly_back';                          // 70% — fly backward into background
  }

  /**
   * Award score gradually instead of in one jump.
   *
   * Fodder waves already climb continuously because enemies die one at a time,
   * but single large awards landed as one lump and then the counter sat frozen
   * for seconds. A visibly climbing number is what makes a gap read as progress
   * rather than dead air. The book total is preserved exactly — this changes
   * only WHEN the number arrives, never how much.
   */
  private awardScoreRamped(amount: number, overFrames: number) {
    if (amount <= 0) return;
    if (overFrames <= 1) {
      this.multiplier = Math.round((this.multiplier + amount) * 10) / 10;
      this.callbacks.onMultiplierChange(this.multiplier);
      return;
    }
    this.rampRemaining += amount;
    this.rampPerFrame = this.rampRemaining / overFrames;
  }

  private updateScoreRamp(dt: number) {
    if (this.rampRemaining <= 0) return;
    const step = Math.min(this.rampRemaining, this.rampPerFrame * dt);
    this.rampRemaining -= step;
    const next = Math.round((this.multiplier + step) * 10) / 10;
    if (next !== this.multiplier) {
      this.multiplier = next;
      this.callbacks.onMultiplierChange(this.multiplier);
    }
  }

  /** Pay out any un-ramped remainder immediately — the book total must not drift. */
  private flushScoreRamp() {
    if (this.rampRemaining <= 0) return;
    this.multiplier = Math.round((this.multiplier + this.rampRemaining) * 10) / 10;
    this.rampRemaining = 0;
    this.callbacks.onMultiplierChange(this.multiplier);
  }

  private killEnemy(enemy: Enemy, killValue: number) {
    enemy.alive = false;
    this.killCount++;
    this.callbacks.onKillCountChange(this.killCount);

    // While the potion buff is active, each kill pays out more AND ticks the
    // "xN" combo above the hero so the buff visibly feeds the score.
    const potionActive = this.potionPhase === 'grow' || this.potionPhase === 'hold';
    const effectiveValue = potionActive ? killValue * POTION_KILL_MULT : killValue;

    this.multiplier += effectiveValue;
    this.multiplier = Math.round(this.multiplier * 10) / 10;
    this.callbacks.onMultiplierChange(this.multiplier);

    if (potionActive) {
      this.potionComboKills++;
      this.potionComboX = Math.round((this.potionComboX + effectiveValue) * 10) / 10;
    }

    this.spawnFloatingNumber(
      enemy.entity.container.x,
      enemy.entity.container.y - 50,
      `+$${effectiveValue.toFixed(1)}${potionActive ? '!' : ''}`,
      potionActive ? 0xB8FFB0 : 0xFFD700
    );

    // Mini-boss kill — big celebration but round continues; castle fades back out
    if (enemy.isMiniBoss) {
      const miniText = new TextStyle({
        fontFamily: 'Impact, Arial Black, sans-serif', fontSize: 36, fontWeight: 'bold',
        fill: 0xFFCC22, stroke: { color: 0x000000, width: 5 },
        dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.7 },
      });
      const mt = new Text({ text: 'BOSS FELLED!', style: miniText });
      mt.anchor.set(0.5);
      mt.x = GAME_WIDTH / 2;
      mt.y = GAME_HEIGHT / 2 - 60;
      mt.scale.set(0);
      this.uiContainer.addChild(mt);
      this.floatingNumbers.push({ text: mt, vx: 0, vy: -0.4, life: 70, maxLife: 70 });

      this.triggerShake(18, 22);
      this.callbacks.onFlashScreen('rgba(255, 200, 0, 0.3)');

      for (let j = 0; j < 5; j++) {
        this.spawnDeathParticles(enemy.entity.container.x + (Math.random() - 0.5) * 180, enemy.entity.container.y - 30 + (Math.random() - 0.5) * 60, 12);
      }

      // Fade castle back out after a beat
      setTimeout(() => { this.castleTarget = 0; }, 900);
    }

    // Final boss kill — massive effects + end round
    if (enemy.isFinalBoss) {
      const bossText = new TextStyle({
        fontFamily: 'Impact, Arial Black, sans-serif', fontSize: 42, fontWeight: 'bold',
        fill: 0xFF4400, stroke: { color: 0x000000, width: 5 },
        dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.7 },
      });
      const bt = new Text({ text: 'BOSS SLAIN!', style: bossText });
      bt.anchor.set(0.5);
      bt.x = GAME_WIDTH / 2;
      bt.y = GAME_HEIGHT / 2 - 60;
      bt.scale.set(0);
      this.uiContainer.addChild(bt);
      this.floatingNumbers.push({ text: bt, vx: 0, vy: -0.5, life: 80, maxLife: 80 });

      this.triggerShake(25, 30);
      this.callbacks.onFlashScreen('rgba(255, 200, 0, 0.3)');

      for (let j = 0; j < 8; j++) {
        this.spawnDeathParticles(enemy.entity.container.x + (Math.random() - 0.5) * 200, enemy.entity.container.y - 30 + (Math.random() - 0.5) * 60, 15);
        this.spawnImpactFlash(enemy.entity.container.x + (Math.random() - 0.5) * 150, enemy.entity.container.y - 20 + (Math.random() - 0.5) * 40);
      }

      // Slam-shut the spawn pipeline so no late waves/events can leak into the
      // result-overlay window during the 2s celebration.
      this.eventQueue = [];
      this.pendingWave = null;
      setTimeout(() => this.endRound(true), 2000);
    }

    const deathType = this.pickDeathType();
    const c = enemy.entity.container;

    switch (deathType) {
      case 'fly_back':
        // Fly into the background (upward and slightly right, shrink)
        this.deadEnemies.push({
          container: c, type: 'fly_back', splatted: false,
          vy: -5 - Math.random() * 4,
          vx: 1 + Math.random() * 2,
          vz: 0,
          rotSpeed: (Math.random() - 0.5) * 0.35,
          life: 45,
          scaleDecay: 0.96,
          slideTimer: 0, targetScale: 0,
        });
        break;

      case 'fly_past':
        // Fly past the hero to the left
        this.deadEnemies.push({
          container: c, type: 'fly_past', splatted: false,
          vy: -3 - Math.random() * 2,
          vx: -8 - Math.random() * 4, // strong leftward
          vz: 0,
          rotSpeed: -0.2 - Math.random() * 0.3,
          life: 50,
          scaleDecay: 0.97,
          slideTimer: 0, targetScale: 0,
        });
        break;

      case 'fly_forward':
        // Arc up and back to the right (the way they came), over the incoming enemies
        this.deadEnemies.push({
          container: c, type: 'fly_forward', splatted: false,
          vy: -8 - Math.random() * 3, // strong upward launch
          vx: 5 + Math.random() * 4,  // back to the right
          vz: 0,
          rotSpeed: 0.2 + Math.random() * 0.3,
          life: 55,
          scaleDecay: 0.97,
          slideTimer: 0, targetScale: 0,
        });
        break;

      case 'splat_screen':
        // Fly toward the camera — scale up huge (2-6x), hold 0.25s, then POP
        this.worldContainer.removeChild(c);
        this.splatContainer.addChild(c);
        c.x = enemy.entity.container.x;
        c.y = enemy.entity.container.y;
        const splatScale = 2 + Math.random() * 4; // 2x to 6x size
        this.deadEnemies.push({
          container: c, type: 'splat_screen', splatted: false,
          vy: 0,
          vx: 0,
          vz: 1,
          rotSpeed: (Math.random() - 0.5) * 0.15,
          life: 999,
          scaleDecay: 1.0,
          slideTimer: 15, // 0.25 seconds at 60fps
          targetScale: splatScale,
        });
        break;
    }

    // Particles at impact point
    this.spawnDeathParticles(c.x, c.y - 30, deathType === 'splat_screen' ? 6 : 12);
    this.spawnImpactFlash(c.x, c.y - 30);
  }

  // ─── Floating Numbers ───────────────────────────────────────
  private spawnFloatingNumber(x: number, y: number, value: string, color: number) {
    const style = new TextStyle({
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: 24,
      fontWeight: 'bold',
      fill: color,
      stroke: { color: 0x000000, width: 4 },
      dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.6 },
    });
    const text = new Text({ text: value, style });
    text.anchor.set(0.5);
    text.x = x + (Math.random() - 0.5) * 40;
    text.y = y;
    text.scale.set(0);
    this.uiContainer.addChild(text);
    this.floatingNumbers.push({ text, vx: (Math.random() - 0.5) * 0.5, vy: -2.0, life: 50, maxLife: 50 });
  }

  private updateFloatingNumbers(dt: number) {
    for (let i = this.floatingNumbers.length - 1; i >= 0; i--) {
      const fn = this.floatingNumbers[i];
      fn.life -= dt;
      fn.text.y += fn.vy * dt;
      fn.text.x += fn.vx * dt;
      fn.vy *= 0.98;
      const age = fn.maxLife - fn.life;
      if (age < 6) {
        fn.text.scale.set(Math.min(1.3, age / 3.5));
      } else if (age < 10) {
        fn.text.scale.set(1.3 - (age - 6) * 0.075);
      }
      fn.text.alpha = Math.max(0, Math.min(1, fn.life / 20));
      if (fn.life <= 0) {
        this.uiContainer.removeChild(fn.text);
        this.floatingNumbers.splice(i, 1);
      }
    }
  }

  // ─── Particles ──────────────────────────────────────────────
  private spawnDeathParticles(x: number, y: number, count = 8, palette?: number[]) {
    const colors = palette ?? [0xFF4444, 0xFF8800, 0xFFDD00, 0xFFFFFF, 0xFF6600, 0xFFAA00];
    for (let i = 0; i < count; i++) {
      const gfx = new Graphics();
      const size = 2 + Math.random() * 6;
      if (Math.random() > 0.5) {
        gfx.rect(-size / 2, -size / 2, size, size);
      } else {
        gfx.circle(0, 0, size / 2);
      }
      gfx.fill(colors[Math.floor(Math.random() * colors.length)]);
      gfx.x = x + (Math.random() - 0.5) * 20;
      gfx.y = y + (Math.random() - 0.5) * 10;
      this.worldContainer.addChild(gfx);

      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      this.particles.push({
        gfx, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3,
        life: 15 + Math.random() * 25, rotSpeed: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  private spawnSplatParticles(x: number, y: number) {
    // Big chunky particles that spray outward from splat point — rendered in splatContainer
    const colors = [0xFF2222, 0xFF6600, 0xFFAA00, 0xFFFF00, 0xFFFFFF];
    for (let i = 0; i < 20; i++) {
      const gfx = new Graphics();
      const size = 4 + Math.random() * 10;
      gfx.rect(-size / 2, -size / 2, size, size);
      gfx.fill(colors[Math.floor(Math.random() * colors.length)]);
      gfx.x = x;
      gfx.y = y;
      this.splatContainer.addChild(gfx);

      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 10;
      this.particles.push({
        gfx, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 15, rotSpeed: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  /**
   * Sprite-shatter — visually pops a `source` Container into a grid of chunk
   * sprites that fly outward. Used by the `spontaneous_combustion` ambush
   * variant. The `source` is captured to a one-shot texture, sliced into
   * `rows × cols` rectangles, and each chunk is pushed into the live particle
   * list so updateParticles handles physics + fadeout for free.
   *
   * The source itself is NOT destroyed here — the caller decides whether to
   * hide/remove the original sprite (e.g. setting heroEntity.container.visible
   * = false until the next round init).
   */
  private spawnSpriteShatter(
    source: Container,
    opts: {
      rows?: number;
      cols?: number;
      impulse?: number;
      durationFrames?: number;
      // Flavour drives shard density, fall speed, upward arc, and puff palette.
      // 'combust' (default): orange pop (matches the original debug-K behaviour).
      // 'banana': yellow puff + stronger upward arc (slip-and-fall).
      // 'bossStrike': denser shards, slower fall, bigger puff (final-boss kill).
      flavour?: 'combust' | 'banana' | 'bossStrike';
    } = {},
  ) {
    const flavour = opts.flavour ?? 'combust';
    const isBoss = flavour === 'bossStrike';
    const isBanana = flavour === 'banana';
    const rows = opts.rows ?? (isBoss ? 3 : 2);
    const cols = opts.cols ?? (isBoss ? 4 : 3);
    const impulse = opts.impulse ?? (isBoss ? 3.5 : 3.0); // px/frame at 60fps
    const life = opts.durationFrames ?? (isBoss ? 130 : 90); // 90 ≈ 1.5s @ 60fps
    const upwardBias = isBanana ? 2.4 : 1.4;
    const puffCount = isBoss ? 16 : isBanana ? 10 : 8;
    const puffPalette = isBanana
      ? [0xFFE044, 0xFFF080, 0xFFFFAA, 0xFFD000, 0xFFFFFF]
      : isBoss
        ? [0xFF4444, 0xFF8800, 0xFF0000, 0xFFFFFF, 0xFFAA00, 0xCC0000]
        : undefined; // combust = default red/orange palette

    // Capture the current visual state of `source` to a texture. generateTexture
    // walks the container, so we get whatever frame the hero is on right now.
    // Ref-count: when the last chunk expires, destroy the shared RenderTexture
    // (and its source) so we don't leak GPU memory across repeated shatters.
    const tex = this.app.renderer.generateTexture(source);
    const chunkPool = { remaining: rows * cols, tex };
    const fullW = tex.width;
    const fullH = tex.height;
    const chunkW = fullW / cols;
    const chunkH = fullH / rows;

    // World-space anchor: source's top-left in the world container's frame.
    // Use getGlobalPosition then convert into the parent we'll add chunks to.
    const parent = source.parent ?? this.worldContainer;
    const global = source.getGlobalPosition();
    const local = parent.toLocal(global);
    const sx = source.scale.x;
    const sy = source.scale.y;
    const drawW = fullW * sx;
    const drawH = fullH * sy;
    // source uses anchor 0.5,1.0 (feet centred). Compute top-left to align chunks.
    const topLeftX = local.x - drawW * 0.5;
    const topLeftY = local.y - drawH;

    const centreX = local.x;
    const centreY = local.y - drawH * 0.5;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const frame = new Rectangle(c * chunkW, r * chunkH, chunkW, chunkH);
        const chunkTex = new Texture({ source: tex.source, frame });
        const chunk = new Sprite(chunkTex);
        chunk.anchor.set(0, 0);
        chunk.scale.set(sx, sy);
        // Position chunk where its slice lived inside the source.
        chunk.x = topLeftX + c * chunkW * sx;
        chunk.y = topLeftY + r * chunkH * sy;
        parent.addChild(chunk);

        // Outward velocity from chunk centre relative to source centre.
        const cxMid = chunk.x + (chunkW * sx) / 2;
        const cyMid = chunk.y + (chunkH * sy) / 2;
        let dx = cxMid - centreX;
        let dy = cyMid - centreY;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        // Upward bias makes it read as a pop, not a sag. Banana flavour
        // bumps it up further for the comedic slip-and-fall arc.
        const jitter = 0.4 + Math.random() * 0.6;
        const vx = dx * impulse * jitter;
        const vy = dy * impulse * jitter - upwardBias;

        this.particles.push({
          gfx: chunk,
          vx,
          vy,
          life: life + Math.random() * 10,
          rotSpeed: (Math.random() - 0.5) * 0.25,
          onExpire: () => {
            // Free the per-chunk Sprite + its sub-texture; keep the shared
            // source alive until every sibling chunk has also expired.
            chunk.destroy({ children: false, texture: true, textureSource: false });
            chunkPool.remaining--;
            if (chunkPool.remaining === 0) chunkPool.tex.destroy(true);
          },
        });
      }
    }

    // Tiny puff of particles underneath the pop. Palette is flavour-tinted.
    this.spawnDeathParticles(centreX, centreY, puffCount, puffPalette);
  }

  /**
   * Wounded-flinch beat for the post-mini-kill erosion path. Layered on top of
   * the erosion event's own VFX (powerdown smoke / lightning bolt / dragon
   * strafe) — anchors the score loss to the hero's body rather than letting
   * it read as silent score decay.
   */
  private playWoundedFlinch() {
    this.flinchTintFrames = 14;
    this.heroEntity.sprite.tint = 0xFF5555;
    const heroX = this.heroEntity.container.x;
    const footY = this.heroEntity.container.y; // anchor 0.5,1.0 → y is foot
    const blood = [0xCC0000, 0x880000, 0xFF2222, 0x660000, 0xAA1111];
    this.spawnDeathParticles(heroX, footY - 8, 12, blood);
    this.triggerShake(7, 14);
    this.callbacks.onFlashScreen('rgba(180, 30, 30, 0.25)');
  }

  private spawnImpactFlash(x: number, y: number) {
    const flash = new Graphics();
    flash.circle(0, 0, 5);
    flash.fill(0xFFFFFF);
    flash.x = x;
    flash.y = y;
    flash.alpha = 0.9;
    this.worldContainer.addChild(flash);
    this.particles.push({ gfx: flash, vx: 0, vy: 0, life: 8, rotSpeed: 0 });

    for (let i = 0; i < 4; i++) {
      const spark = new Graphics();
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      spark.rect(-1, -8, 2, 16);
      spark.fill(0xFFFF88);
      spark.x = x;
      spark.y = y;
      spark.rotation = angle;
      this.worldContainer.addChild(spark);
      this.particles.push({
        gfx: spark, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5,
        life: 6 + Math.random() * 4, rotSpeed: 0,
      });
    }
  }

  // ─── Spell Projectiles ────────────────────────────────────────
  private spawnSpellProjectile() {
    const gfx = new Container();

    // Outer glow
    const glow = new Graphics();
    glow.circle(0, 0, 14);
    glow.fill({ color: 0xFF4400, alpha: 0.4 });
    gfx.addChild(glow);

    // Core fireball
    const core = new Graphics();
    core.circle(0, 0, 8);
    core.fill(0xFF6600);
    gfx.addChild(core);

    // Hot center
    const center = new Graphics();
    center.circle(0, 0, 4);
    center.fill(0xFFFF88);
    gfx.addChild(center);

    const fromX = GAME_WIDTH + 20;
    const fromY = GROUND_Y - 80 - Math.random() * 120;
    gfx.x = fromX;
    gfx.y = fromY;
    this.worldContainer.addChild(gfx);

    const toX = this.heroEntity.container.x;
    const toY = this.heroEntity.container.y - 30;
    const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
    const speed = dist / 50; // arrives in ~50 frames
    const dx = toX - fromX;
    const dy = toY - fromY;
    const mag = Math.sqrt(dx * dx + dy * dy);

    this.projectiles.push({
      gfx,
      x: fromX, y: fromY,
      vx: (dx / mag) * speed,
      vy: (dy / mag) * speed,
      life: 60,
      trailTimer: 0,
    });
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.gfx.x = p.x;
      p.gfx.y = p.y;
      p.gfx.rotation += 0.15 * dt;
      p.life -= dt;

      // Trail particles every 2 frames
      p.trailTimer += dt;
      if (p.trailTimer >= 2) {
        p.trailTimer = 0;
        const trail = new Graphics();
        const size = 2 + Math.random() * 3;
        trail.circle(0, 0, size);
        trail.fill(Math.random() > 0.5 ? 0xFF6600 : 0xFF2200);
        trail.x = p.x + (Math.random() - 0.5) * 6;
        trail.y = p.y + (Math.random() - 0.5) * 6;
        this.worldContainer.addChild(trail);
        this.particles.push({
          gfx: trail, vx: (Math.random() - 0.5) * 1, vy: -0.5 - Math.random(),
          life: 6 + Math.random() * 4, rotSpeed: 0,
        });
      }

      // Check if reached hero
      const heroX = this.heroEntity.container.x;
      const heroY = this.heroEntity.container.y - 30;
      const distToHero = Math.sqrt((p.x - heroX) ** 2 + (p.y - heroY) ** 2);

      if (distToHero < 40 || p.life <= 0) {
        // Spell impact explosion — purple/blue burst
        const spellColors = [0x8844FF, 0x4444FF, 0xAA66FF, 0xFFFFFF, 0xFF44FF];
        for (let j = 0; j < 15; j++) {
          const spark = new Graphics();
          const sz = 2 + Math.random() * 5;
          if (Math.random() > 0.5) {
            spark.circle(0, 0, sz);
          } else {
            spark.rect(-sz / 2, -sz / 2, sz, sz);
          }
          spark.fill(spellColors[Math.floor(Math.random() * spellColors.length)]);
          spark.x = p.x;
          spark.y = p.y;
          this.worldContainer.addChild(spark);
          const angle = Math.random() * Math.PI * 2;
          const spd = 4 + Math.random() * 8;
          this.particles.push({
            gfx: spark, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 2,
            life: 15 + Math.random() * 15, rotSpeed: (Math.random() - 0.5) * 0.4,
          });
        }

        // Purple flash — cosmetic only (hearts removed; spells no longer damage)
        this.callbacks.onFlashScreen('rgba(120, 40, 200, 0.35)');
        this.triggerShake(8, 10);

        p.gfx.parent?.removeChild(p.gfx);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;
      p.vy += 0.15 * dt;
      p.gfx.rotation += p.rotSpeed * dt;
      p.gfx.alpha = Math.max(0, p.life / 15);
      if (p.vx === 0 && p.vy === 0) {
        p.gfx.scale.set(1 + (8 - p.life) * 0.4);
      }
      if (p.life <= 0) {
        // Remove from whichever container it's in
        p.gfx.parent?.removeChild(p.gfx);
        p.onExpire?.();
        this.particles.splice(i, 1);
      }
    }
  }

  // ─── Dead Enemy Updates ─────────────────────────────────────
  private updateDeadEnemies(dt: number) {
    for (let i = this.deadEnemies.length - 1; i >= 0; i--) {
      const de = this.deadEnemies[i];
      de.life -= dt;

      switch (de.type) {
        case 'fly_back':
          // Fly up into background, shrink
          de.container.y += de.vy * dt;
          de.container.x += de.vx * dt;
          de.vy += 0.06 * dt;
          de.container.rotation += de.rotSpeed * dt;
          de.container.scale.set(
            de.container.scale.x * de.scaleDecay,
            de.container.scale.y * de.scaleDecay
          );
          de.container.alpha = Math.max(0, de.life / 20);
          if (de.life > 10 && Math.random() > 0.7) {
            this.spawnDeathParticles(de.container.x, de.container.y, 2);
          }
          break;

        case 'fly_past':
          // Fly past hero to the left
          de.container.y += de.vy * dt;
          de.container.x += de.vx * dt;
          de.vy += 0.1 * dt;
          de.container.rotation += de.rotSpeed * dt;
          de.container.alpha = Math.max(0, de.life / 25);
          if (de.life > 15 && Math.random() > 0.7) {
            this.spawnDeathParticles(de.container.x, de.container.y, 2);
          }
          break;

        case 'fly_forward':
          // Arc up and back to the right over incoming enemies
          de.container.y += de.vy * dt;
          de.container.x += de.vx * dt;
          de.vy += 0.2 * dt; // gravity brings it back down
          de.container.rotation += de.rotSpeed * dt;
          de.container.alpha = Math.max(0, de.life / 20);
          // When it comes back down past ground level, explode
          if (de.container.y > GROUND_Y + 20 && de.vy > 0 && !de.splatted) {
            de.splatted = true;
            this.spawnDeathParticles(de.container.x, de.container.y - 20, 10);
            this.spawnImpactFlash(de.container.x, de.container.y - 20);
            de.life = Math.min(de.life, 5); // fade fast after exploding
          }
          if (de.life > 15 && Math.random() > 0.6) {
            this.spawnDeathParticles(de.container.x, de.container.y, 1);
          }
          break;

        case 'splat_screen':
          if (!de.splatted) {
            // Phase 1: Scale up rapidly toward the player's face
            const currentScale = Math.abs(de.container.scale.x);
            const growRate = 1.15;
            de.container.scale.set(
              de.container.scale.x * growRate,
              de.container.scale.y * growRate
            );
            de.container.rotation += de.rotSpeed * dt;
            // Drift toward screen center
            de.container.x += (GAME_WIDTH * 0.5 - de.container.x) * 0.06 * dt;
            de.container.y += (GAME_HEIGHT * 0.4 - de.container.y) * 0.06 * dt;

            // When target scale reached: HIT the screen (no squash, keep proportions)
            if (currentScale >= de.targetScale) {
              de.splatted = true;
              de.container.rotation = 0;
              de.container.alpha = 0.9;
              // Impact effects
              this.triggerShake(12, 15);
              this.callbacks.onFlashScreen('rgba(255, 100, 0, 0.3)');
              this.spawnSplatParticles(de.container.x, de.container.y);
            }
          } else {
            // Phase 2: Hold in place for 0.25s, then POP
            de.slideTimer -= dt;

            if (de.slideTimer <= 0) {
              // POP! — massive explosion, screen shake, remove
              this.spawnSplatParticles(de.container.x, de.container.y);
              this.spawnSplatParticles(de.container.x - 40, de.container.y + 20);
              this.spawnSplatParticles(de.container.x + 40, de.container.y - 20);
              this.triggerShake(15, 12);
              this.callbacks.onFlashScreen('rgba(255, 255, 255, 0.4)');
              de.container.parent?.removeChild(de.container);
              this.deadEnemies.splice(i, 1);
              continue;
            }
          }
          break;
      }

      if (de.life <= 0) {
        de.container.parent?.removeChild(de.container);
        this.deadEnemies.splice(i, 1);
      }
    }
  }

  // ─── Cosmetic callouts ──────────────────────────────────────
  // Drop the Boss fires a named micro-beat (BACK FLIP! / FRONT FLIP!) roughly
  // every 4 seconds for the entire fall. They are purely cosmetic — they name
  // what the character is already doing — but they convert continuous motion
  // into discrete beats, which is what stops a long round reading as dead air.
  //
  // These are NOT book events. They carry no score, appear in no book, and
  // touch neither the contract nor the math. They exist only to give the eye
  // something to land on between the real events, now that rounds are ~6x
  // longer. Selection walks a fixed table offset by the book id rather than
  // using Math.random(), so a pinned replay shows the same sequence.
  private static readonly CALLOUTS: Array<{ text: string; color: number }> = [
    { text: 'CLEAVE!', color: 0xFFD54A },
    { text: 'SMASH!', color: 0xFF8A3D },
    { text: 'PARRY!', color: 0x8FD5FF },
    { text: 'RAMPAGE!', color: 0xFF5E5E },
    { text: 'OVERHEAD!', color: 0xFFD54A },
    { text: 'RIPOSTE!', color: 0x9CFF7A },
    { text: 'WHIRLWIND!', color: 0xC79BFF },
    { text: 'CRUSHING BLOW!', color: 0xFF8A3D },
    { text: 'NO MERCY!', color: 0xFF5E5E },
    { text: 'FOOTWORK!', color: 0x8FD5FF },
  ];
  private static readonly CALLOUT_INTERVAL = 205; // ~3.4s — DtB's cadence

  private updateCallouts(dt: number) {
    if (!this.playing || this.snatchActive || this.finaleActive) return;
    // Only name what the hero is ACTUALLY doing. Firing melee verbs into an
    // empty field is worse than silence — in a no-input game legibility is the
    // entire fairness story, and a callout with no visible cause is a lie about
    // what just happened. (It also read absurdly on the wizard, who carries a
    // spellbook.) Gaps get filled with stage content, not with captions.
    if (!this.isKilling && this.enemies.length === 0) {
      this.calloutTimer = 0;
      return;
    }
    this.calloutTimer += dt;
    if (this.calloutTimer < SlayTheBeastGame.CALLOUT_INTERVAL) return;
    this.calloutTimer = 0;

    const table = SlayTheBeastGame.CALLOUTS;
    const pick = table[(this.calloutIndex + this.roundSeed) % table.length];
    this.calloutIndex++;

    // Small pill above the hero — deliberately near the actor and the money
    // label, so the eye never has to travel to find out something happened.
    const style = new TextStyle({
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: 26,
      fill: pick.color,
      stroke: { color: 0x1a1a1a, width: 5 },
    });
    const t = new Text({ text: pick.text, style });
    t.anchor.set(0.5, 0.5);
    t.x = this.heroEntity.container.x + 18;
    // heroBaseY is the sprite-frame baseline, not the visible feet — the sheets
    // carry ~70px of empty space below the character. At -210 the pill rendered
    // straight across the hero's face; clear the head properly.
    t.y = this.heroBaseY - 320;
    this.uiContainer.addChild(t);
    this.floatingNumbers.push({ text: t, vx: 0, vy: -0.42, life: 46, maxLife: 46 });
  }

  // ─── Screen Shake ───────────────────────────────────────────
  // Trauma model (Squirrel Eiserloh, GDC 2016). Events ADD trauma; the camera
  // decays it continuously; displacement is trauma^2. Two things matter and the
  // old max-combining random-per-frame version got both wrong:
  //   1. Squared, not linear — so a big hit is dramatically bigger than a small
  //      one instead of every shake feeling the same. (Cubed is the usual advice,
  //      but at trauma 0.3 that yields ~3% displacement, which is invisible in a
  //      slot that fires far fewer shake events than an action game. Squared.)
  //   2. SMOOTH noise, not Math.random() per frame — per-frame random strobes and
  //      reads cheap; coherent noise reads as a physical camera being knocked.
  // Rotation is included because in 2D, translation + rotation is what sells it.
  private static readonly TRAUMA_DECAY = 0.8 / 60; // per frame
  private static readonly SHAKE_MAX_OFFSET_X = 26;
  private static readonly SHAKE_MAX_OFFSET_Y = 18;
  private static readonly SHAKE_MAX_ROLL = 0.035; // rad ≈ 2°

  /** Cheap coherent noise — summed sines at irrational-ish ratios, decorrelated by seed. */
  private shakeNoise(seed: number, t: number): number {
    return (
      Math.sin(t * 1.00 + seed * 13.7) * 0.6 +
      Math.sin(t * 2.37 + seed * 7.13) * 0.3 +
      Math.sin(t * 4.91 + seed * 3.11) * 0.1
    );
  }

  /**
   * @param intensity legacy 0-30ish scale from existing call sites; mapped to trauma.
   */
  private triggerShake(intensity: number, _duration = 0) {
    this.trauma = Math.min(1, this.trauma + intensity / 34);
  }

  private updateShake(dt: number) {
    this.shakeClock += dt;
    if (this.trauma <= 0) {
      this.worldContainer.x = GAME_WIDTH / 2;
      this.worldContainer.y = GAME_HEIGHT / 2;
      this.worldContainer.rotation = 0;
      return;
    }
    this.trauma = Math.max(0, this.trauma - SlayTheBeastGame.TRAUMA_DECAY * dt);
    const s = this.trauma * this.trauma;
    const t = this.shakeClock * 0.36;
    this.worldContainer.x = GAME_WIDTH / 2 + SlayTheBeastGame.SHAKE_MAX_OFFSET_X * s * this.shakeNoise(1, t);
    this.worldContainer.y = GAME_HEIGHT / 2 + SlayTheBeastGame.SHAKE_MAX_OFFSET_Y * s * this.shakeNoise(2, t);
    this.worldContainer.rotation = SlayTheBeastGame.SHAKE_MAX_ROLL * s * this.shakeNoise(3, t * 0.82);
  }

  // ─── Flying Dragons ─────────────────────────────────────────
  // A dragon flies overhead from right to left; partway across it drops a
  // payload (fireball or poop). Dragon uses the animated big-enemy dragon sheet
  // at a fast frame rate so the wings flap instead of presenting a static PNG.
  private spawnFlyingDragon(attackType: 'fireball' | 'poop', moneyLoss: number) {
    // Reuse the already-loaded animated dragon sheet (4x16) so it flaps its wings.
    // Index 0 of the big-enemy bank is the dragon — pin it explicitly so the
    // silhouette reads correctly (cyclops/bear swooping wouldn't work).
    const entity = this.createAnimatedEntity(this.bigEnemyTextureBank[0], ENEMY_SCALE * 1.5, true);
    // "Left_walk" is the flap cycle from the player's perspective. Fast frame speed
    // reads as flapping, not walking.
    this.setAnimation(entity, 'left_walk');
    entity.frameSpeed = 3;
    entity.sprite.tint = attackType === 'fireball' ? 0xFF7755 : 0x88AA66;

    const container = entity.container;
    container.x = GAME_WIDTH + 140;
    container.y = 260 + Math.random() * 50;
    this.worldContainer.addChild(container);
    this.worldContainer.sortChildren();

    // Wrap into the existing FlyingDragon shape — we piggyback on `sprite` but
    // animation updates are driven via the entity in updateFlyingDragons.
    const sprite = entity.sprite;

    const dropX = 220 + Math.random() * 180;
    this.flyingDragons.push({
      entity,
      container, sprite,
      vx: -3.5 - Math.random() * 1.2,
      bobTimer: 0,
      dropX,
      hasDropped: false,
      attackType, moneyLoss,
      life: 400,
    });

    const bannerColor = attackType === 'fireball' ? 0xFF4422 : 0x886622;
    this.spawnBanner(attackType === 'fireball' ? 'DRAGON!' : 'INCOMING!', bannerColor, 38, 50);
  }

  private updateFlyingDragons(dt: number) {
    for (let i = this.flyingDragons.length - 1; i >= 0; i--) {
      const d = this.flyingDragons[i];
      d.bobTimer += dt * 0.08;
      d.container.x += d.vx * dt;
      d.container.y += Math.sin(d.bobTimer) * 0.35;
      this.updateAnimation(d.entity, dt); // flap wings
      d.life -= dt;

      if (!d.hasDropped && d.container.x <= d.dropX) {
        d.hasDropped = true;
        this.spawnDragonPayload(d.container.x, d.container.y + 20, d.attackType, d.moneyLoss);
      }

      if (d.container.x < -220 || d.life <= 0) {
        d.container.parent?.removeChild(d.container);
        this.flyingDragons.splice(i, 1);
      }
    }
  }

  private spawnDragonPayload(x: number, y: number, attackType: 'fireball' | 'poop', moneyLoss: number) {
    const container = new Container();
    if (attackType === 'fireball') {
      // HUGE fireball — three stacked glows + a molten core
      const outerGlow = new Graphics();
      outerGlow.circle(0, 0, 58);
      outerGlow.fill({ color: 0xFF3300, alpha: 0.25 });
      const glow = new Graphics();
      glow.circle(0, 0, 44);
      glow.fill({ color: 0xFF4400, alpha: 0.55 });
      const core = new Graphics();
      core.circle(0, 0, 30);
      core.fill(0xFF6A00);
      const hot = new Graphics();
      hot.circle(0, 0, 18);
      hot.fill(0xFFAA22);
      const center = new Graphics();
      center.circle(0, 0, 9);
      center.fill(0xFFFF88);
      // Jagged flame tongues
      const tongues = new Graphics();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        const r1 = 40;
        const r2 = 68;
        tongues.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        tongues.lineTo(Math.cos(ang + 0.18) * r2, Math.sin(ang + 0.18) * r2);
        tongues.lineTo(Math.cos(ang + 0.36) * r1, Math.sin(ang + 0.36) * r1);
      }
      tongues.fill({ color: 0xFF7722, alpha: 0.7 });
      container.addChild(outerGlow, tongues, glow, core, hot, center);
    } else {
      // Oversized dropping — clearly readable in the air as an incoming splat
      const haze = new Graphics();
      haze.circle(0, 0, 44);
      haze.fill({ color: 0x4a3018, alpha: 0.3 });
      const body = new Graphics();
      body.ellipse(0, 0, 42, 34);
      body.fill(0x5a3d1f);
      const mid = new Graphics();
      mid.ellipse(-2, -8, 28, 20);
      mid.fill(0x6e4a26);
      const lump = new Graphics();
      lump.ellipse(-4, -18, 18, 12);
      lump.fill(0x7d5830);
      const peak = new Graphics();
      peak.ellipse(-6, -26, 10, 7);
      peak.fill(0x8a6236);
      const hl = new Graphics();
      hl.ellipse(-10, -24, 6, 3);
      hl.fill(0xa07c4a);
      // Stink lines
      const stink = new Graphics();
      stink.moveTo(-20, -30); stink.quadraticCurveTo(-16, -40, -22, -48);
      stink.moveTo(0, -36);   stink.quadraticCurveTo(6, -46, -2, -56);
      stink.moveTo(20, -30);  stink.quadraticCurveTo(24, -40, 18, -48);
      stink.stroke({ width: 3, color: 0x7a5a30, alpha: 0.7 });
      container.addChild(haze, body, mid, lump, peak, hl, stink);
    }
    container.x = x;
    container.y = y;
    this.worldContainer.addChild(container);

    this.dragonPayloads.push({
      gfx: container,
      x, y,
      vy: 1.2,
      life: 180,
      attackType, moneyLoss,
    });
  }

  private updateDragonPayloads(dt: number) {
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y - 40;
    for (let i = this.dragonPayloads.length - 1; i >= 0; i--) {
      const p = this.dragonPayloads[i];
      p.vy += 0.42 * dt;
      p.y += p.vy * dt;
      p.gfx.x = p.x;
      p.gfx.y = p.y;
      p.gfx.rotation += 0.22 * dt;
      p.life -= dt;

      // Small trailing particles
      if (Math.random() > 0.55) {
        const trail = new Graphics();
        const sz = 2 + Math.random() * 3;
        trail.circle(0, 0, sz);
        trail.fill(p.attackType === 'fireball'
          ? (Math.random() > 0.5 ? 0xFF6600 : 0xFFAA00)
          : 0x4a3018);
        trail.x = p.x + (Math.random() - 0.5) * 8;
        trail.y = p.y + (Math.random() - 0.5) * 8;
        this.worldContainer.addChild(trail);
        this.particles.push({
          gfx: trail, vx: (Math.random() - 0.5) * 0.6, vy: -0.2,
          life: 10 + Math.random() * 6, rotSpeed: 0,
        });
      }

      const dx = p.x - heroX;
      const dy = p.y - heroY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = p.attackType === 'fireball' ? 95 : 80;
      const hitHero = dist < hitRadius;
      const hitGround = p.y >= GROUND_Y - 10;

      if (hitHero || hitGround || p.life <= 0) {
        if (hitHero && this.playing) {
          this.applyDragonHit(p.attackType, p.moneyLoss);
        } else if (hitGround) {
          // Splat on the ground — cosmetic puff
          this.spawnDeathParticles(p.x, GROUND_Y - 10,
            p.attackType === 'fireball' ? 10 : 6);
          if (p.attackType === 'fireball') {
            this.callbacks.onFlashScreen('rgba(255, 100, 0, 0.15)');
          }
        }
        p.gfx.parent?.removeChild(p.gfx);
        this.dragonPayloads.splice(i, 1);
      }
    }
  }

  private applyDragonHit(attackType: 'fireball' | 'poop', _moneyLoss: number) {
    const actualLoss = Math.round(this.multiplier / 2 * 10) / 10;
    this.multiplier = Math.round((this.multiplier - actualLoss) * 10) / 10;
    this.callbacks.onMultiplierChange(this.multiplier);

    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;
    const label = attackType === 'fireball' ? 'FIREBALL HIT' : 'POOP STRIKE';
    const labelColor = attackType === 'fireball' ? 0xFF4422 : 0x9A7733;
    this.spawnImpactBanner(label, labelColor, -60);
    this.spawnImpactBanner('-50%', 0xFF2222, 20);
    this.spawnFloatingNumber(heroX, heroY - 130, `-$${actualLoss.toFixed(1)}`, 0xFF2222);
    this.callbacks.onFlashScreen(
      attackType === 'fireball' ? 'rgba(255, 80, 0, 0.6)' : 'rgba(120, 90, 40, 0.4)'
    );
    this.triggerShake(attackType === 'fireball' ? 22 : 12, attackType === 'fireball' ? 22 : 14);
    this.spawnImpactFlash(heroX, heroY - 30);
    this.spawnDeathParticles(heroX, heroY - 30,
      attackType === 'fireball' ? 40 : 10);
    if (attackType === 'fireball') {
      // Extra fire burst
      for (let k = 0; k < 3; k++) {
        this.spawnDeathParticles(
          heroX + (Math.random() - 0.5) * 120,
          heroY - 10 + (Math.random() - 0.5) * 60,
          12,
        );
      }
    }
  }

  // ─── Power-down (trap / curse — halves score + launches hero) ──────
  // Thief has its own choreographed handler (see spawnThief) — it enters from
  // behind, grabs the bag, and flees with half the money.
  private applyPowerdown(flavour: 'trap' | 'thief' | 'curse', bookLoss?: number) {
    if (flavour === 'thief') {
      this.spawnThief();
      return;
    }
    // Apply the book's literal loss when it carries one, exactly as chest applies
    // its literal multiplier. The old unconditional halving ignored scoreDelta
    // entirely and was the biggest source of on-screen vs book divergence.
    const lost = bookLoss && bookLoss > 0 ? Math.min(bookLoss, this.multiplier) : this.multiplier / 2;
    this.multiplier = Math.max(0, Math.round((this.multiplier - lost) * 10) / 10);
    this.callbacks.onMultiplierChange(this.multiplier);
    this.callbacks.onFlashScreen('rgba(255, 0, 0, 0.4)');

    const label = flavour === 'trap' ? 'TRAPPED!' : 'CURSED!';
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;
    this.spawnFloatingNumber(heroX, heroY - 130, `-$${lost.toFixed(1)}`, 0xFF2222);
    this.spawnFloatingNumber(heroX + 40, heroY - 90, label, 0xFF4444);

    this.triggerShake(22, 24);
    this.spawnImpactFlash(heroX, heroY - 30);
    this.spawnDeathParticles(heroX, heroY - 30, 20);

    // If currently potion-giant, blink back to normal mid-air
    if (this.potionPhase !== 'idle') {
      this.potionPhase = 'idle';
      this.potionTimer = 0;
      this.heroEntity.container.scale.set(1);
      // Cartoon "poof"
      for (let i = 0; i < 14; i++) {
        const gfx = new Graphics();
        gfx.circle(0, 0, 4 + Math.random() * 4);
        gfx.fill(0xFFFFFF);
        gfx.x = heroX + (Math.random() - 0.5) * 60;
        gfx.y = heroY - 40 - Math.random() * 60;
        this.worldContainer.addChild(gfx);
        const angle = Math.random() * Math.PI * 2;
        this.particles.push({
          gfx, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3 - 2,
          life: 14 + Math.random() * 8, rotSpeed: 0,
        });
      }
    }

    // Launch hero into the air — strong upward + mild backward drift + spin.
    // Lateral velocity stays small so the arc never carries them off-screen
    // before gravity returns them; otherwise the landing snap to start_x
    // reads as "got carried off then reappeared".
    this.heroAirborne = true;
    this.heroAirVy = -13 - Math.random() * 2;
    this.heroAirVx = -0.35 - Math.random() * 0.3;
    this.heroAirRotSpeed = (0.35 + Math.random() * 0.15);
    this.heroAirX = 0;
    this.heroEntity.container.rotation = 0;
  }

  // ─── Thief ──────────────────────────────────────────────────
  // Sneaks in from off-screen-left (behind the hero), runs up, snatches
  // half the money, then flees back off the left carrying a gold bag.
  private spawnThief() {
    // Pick a random fodder sprite and recolour as a thief (purple cloak vibe)
    const bankIdx = Math.floor(Math.random() * this.enemyTextureBank.length);
    const entity = this.createAnimatedEntity(this.enemyTextureBank[bankIdx], ENEMY_SCALE * 1.15);
    entity.sprite.tint = 0x7744AA;
    entity.frameSpeed = 4; // fast scuttle
    // Thief RUNS right (chasing the hero who's running right), so it faces right
    this.setAnimation(entity, 'right_walk');

    entity.container.x = -60;
    entity.container.y = this.heroBaseY;
    this.worldContainer.addChild(entity.container);
    this.worldContainer.sortChildren();

    const heroX = this.heroEntity.container.x;
    this.thieves.push({
      entity,
      phase: 'chasing',
      grabX: heroX - 20, // catches up just behind the hero
      bagGfx: null,
      moneyLoss: 0, // computed at grab moment (half of multiplier then)
      announced: false,
    });

    // Audible tell — small banner warning
    this.spawnBanner('!', 0xFFCC22, 48, 28);
  }

  private updateThieves(dt: number) {
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;
    for (let i = this.thieves.length - 1; i >= 0; i--) {
      const t = this.thieves[i];
      this.updateAnimation(t.entity, dt);

      if (t.phase === 'chasing') {
        const chaseSpeed = this.currentScrollSpeed + 4.5; // outruns the hero
        t.entity.container.x += chaseSpeed * dt;

        if (t.entity.container.x >= t.grabX) {
          // Grab moment — steal half the money
          const lost = this.multiplier / 2;
          t.moneyLoss = Math.round(lost * 10) / 10;
          this.multiplier = Math.round((this.multiplier - t.moneyLoss) * 10) / 10;
          this.callbacks.onMultiplierChange(this.multiplier);

          this.spawnFloatingNumber(heroX, heroY - 130, `-$${t.moneyLoss.toFixed(1)}`, 0xFF2222);
          this.spawnFloatingNumber(heroX + 40, heroY - 90, 'THIEF!', 0xCC66FF);
          this.callbacks.onFlashScreen('rgba(140, 60, 200, 0.4)');
          this.triggerShake(14, 18);
          this.spawnImpactFlash(heroX - 30, heroY - 30);
          this.spawnDeathParticles(heroX - 20, heroY - 30, 14);

          // Visible gold bag the thief carries away
          const bag = new Graphics();
          bag.ellipse(0, 0, 11, 9);
          bag.fill(0xC9A227);
          bag.rect(-3, -12, 6, 4); // tied top
          bag.fill(0x8a6a14);
          bag.y = -70;
          bag.x = 18;
          t.entity.container.addChild(bag);
          t.bagGfx = bag;

          // Now flip direction, face left, flee
          t.entity.sprite.scale.x = -Math.abs(t.entity.sprite.scale.x);
          this.setAnimation(t.entity, 'left_walk');
          t.phase = 'fleeing';
        }
      } else {
        // Fleeing left — faster than chase to sell the getaway
        const fleeSpeed = this.currentScrollSpeed + 6.5;
        t.entity.container.x -= fleeSpeed * dt;

        // Little sparkle trail from the bag
        if (t.bagGfx && Math.random() > 0.7) {
          const spark = new Graphics();
          spark.circle(0, 0, 2 + Math.random() * 2);
          spark.fill(0xFFD700);
          spark.x = t.entity.container.x + 10;
          spark.y = t.entity.container.y - 60 + (Math.random() - 0.5) * 10;
          this.worldContainer.addChild(spark);
          this.particles.push({
            gfx: spark, vx: -0.6, vy: -0.4,
            life: 12 + Math.random() * 6, rotSpeed: 0,
          });
        }

        if (t.entity.container.x < -120) {
          t.entity.container.parent?.removeChild(t.entity.container);
          this.thieves.splice(i, 1);
        }
      }
    }
  }

  private updateHeroAirborne(dt: number) {
    if (!this.heroAirborne) return;
    const hero = this.heroEntity.container;
    hero.y += this.heroAirVy * dt;
    this.heroAirX += this.heroAirVx * dt;
    hero.x = 160 + this.heroAirX;
    this.heroAirVy += 0.55 * dt; // gravity
    hero.rotation += this.heroAirRotSpeed * dt;

    // Landing
    if (hero.y >= this.heroBaseY && this.heroAirVy > 0) {
      hero.y = this.heroBaseY;
      hero.rotation = 0;
      this.heroAirborne = false;
      this.heroAirVy = 0;
      this.heroAirVx = 0;
      this.heroAirRotSpeed = 0;
      this.heroAirX = 0;
      hero.x = 160;
      // Landing impact
      this.triggerShake(10, 12);
      this.spawnImpactFlash(hero.x, this.heroBaseY - 10);
      this.spawnDeathParticles(hero.x, this.heroBaseY - 10, 12);
      this.callbacks.onFlashScreen('rgba(180, 100, 60, 0.25)');
    }
  }

  // ─── Potion pickup (drifts in from right, hero collects on contact) ───
  // Kicked by the event queue, but the actual grow/boost waits until the
  // hero physically runs into the floating potion.
  private spawnPotionPickup(multBoost: number) {
    const container = new Container();

    // Flask body
    const flask = new Graphics();
    flask.moveTo(-14, -4);
    flask.lineTo(-18, 14);
    flask.quadraticCurveTo(0, 24, 18, 14);
    flask.lineTo(14, -4);
    flask.closePath();
    flask.fill(0x35c96b);

    // Liquid highlight
    const liquid = new Graphics();
    liquid.ellipse(-6, 6, 4, 7);
    liquid.fill({ color: 0xb8ffcc, alpha: 0.8 });

    // Cork + neck
    const neck = new Graphics();
    neck.rect(-8, -14, 16, 12);
    neck.fill(0x2a8a4a);
    const cork = new Graphics();
    cork.rect(-9, -22, 18, 8);
    cork.fill(0x8a5a26);

    // Halo glow so it pops against the grass
    const halo = new Graphics();
    halo.circle(0, 2, 28);
    halo.fill({ color: 0xb8ffcc, alpha: 0.3 });

    container.addChild(halo, flask, liquid, neck, cork);

    container.x = GAME_WIDTH + 60;
    container.y = GROUND_Y - 40 - Math.random() * 50;
    this.worldContainer.addChild(container);
    this.worldContainer.sortChildren();

    this.potionPickups.push({
      container,
      gfx: flask,
      x: container.x,
      y: container.y,
      bobTimer: Math.random() * Math.PI * 2,
      multBoost,
      collected: false,
    });

    this.spawnBanner('POTION!', 0x66FF66, 34, 40);
  }

  private updatePotionPickups(dt: number) {
    if (!this.playing) return;
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;

    for (let i = this.potionPickups.length - 1; i >= 0; i--) {
      const p = this.potionPickups[i];
      if (p.collected) continue;

      p.x -= (this.currentScrollSpeed + 1.2) * dt;
      p.bobTimer += dt * 0.08;
      const bobY = p.y + Math.sin(p.bobTimer) * 6;
      p.container.x = p.x;
      p.container.y = bobY;
      p.container.rotation = Math.sin(p.bobTimer * 0.6) * 0.15;

      // Sparkle trail
      if (Math.random() > 0.5) {
        const spark = new Graphics();
        spark.circle(0, 0, 1 + Math.random() * 2);
        spark.fill(Math.random() > 0.5 ? 0x9fffb0 : 0xffffff);
        spark.x = p.x + (Math.random() - 0.5) * 20;
        spark.y = bobY + (Math.random() - 0.5) * 20;
        this.worldContainer.addChild(spark);
        this.particles.push({
          gfx: spark, vx: -0.3, vy: -0.4,
          life: 14 + Math.random() * 6, rotSpeed: 0,
        });
      }

      // Hero collides → collect
      const dx = p.x - heroX;
      const dy = bobY - (heroY - 40);
      if (Math.abs(dx) < 55 && Math.abs(dy) < 70) {
        p.collected = true;
        this.applyPotion(p.multBoost);
        p.container.parent?.removeChild(p.container);
        this.potionPickups.splice(i, 1);
        continue;
      }

      if (p.x < -120) {
        p.container.parent?.removeChild(p.container);
        this.potionPickups.splice(i, 1);
      }
    }
  }

  // ─── Chest Pickup ───────────────────────────────────────────
  // Rare, high-value floating chest. Hero collects it for a big x100 boost.
  private spawnChestPickup(bonus: number) {
    const container = new Container();

    // Base shadow
    const shadow = new Graphics();
    shadow.ellipse(0, 8, 30, 6);
    shadow.fill({ color: 0x000000, alpha: 0.4 });

    // Golden halo
    const halo = new Graphics();
    halo.circle(0, -12, 42);
    halo.fill({ color: 0xFFE870, alpha: 0.35 });

    // Chest body
    const body = new Graphics();
    body.rect(-28, -22, 56, 28);
    body.fill(0x7a4a1f);
    const bodyTrim = new Graphics();
    bodyTrim.rect(-28, -2, 56, 3);
    bodyTrim.fill(0xC9A227);

    // Domed lid
    const lid = new Graphics();
    lid.moveTo(-28, -22);
    lid.quadraticCurveTo(0, -46, 28, -22);
    lid.lineTo(28, -22);
    lid.lineTo(-28, -22);
    lid.closePath();
    lid.fill(0x8a5a2a);
    const lidTrim = new Graphics();
    lidTrim.moveTo(-28, -22);
    lidTrim.quadraticCurveTo(0, -46, 28, -22);
    lidTrim.stroke({ width: 3, color: 0xC9A227 });

    // Lock + gold peeking out
    const lock = new Graphics();
    lock.rect(-5, -20, 10, 10);
    lock.fill(0xC9A227);
    lock.rect(-2, -18, 4, 5);
    lock.fill(0x2a1a08);
    const coin1 = new Graphics();
    coin1.circle(-16, -24, 5);
    coin1.fill(0xFFD700);
    const coin2 = new Graphics();
    coin2.circle(14, -26, 4);
    coin2.fill(0xFFE870);

    container.addChild(shadow, halo, body, lid, lidTrim, bodyTrim, lock, coin1, coin2);

    container.x = GAME_WIDTH + 80;
    container.y = GROUND_Y - 30 - Math.random() * 30;
    this.worldContainer.addChild(container);
    this.worldContainer.sortChildren();

    this.chestPickups.push({
      container,
      x: container.x,
      y: container.y,
      bobTimer: Math.random() * Math.PI * 2,
      bonus,
      collected: false,
    });

    this.spawnBanner('TREASURE!', 0xFFD700, 38, 45);
  }

  private updateChestPickups(dt: number) {
    if (!this.playing) return;
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;

    for (let i = this.chestPickups.length - 1; i >= 0; i--) {
      const c = this.chestPickups[i];
      if (c.collected) continue;

      c.x -= (this.currentScrollSpeed + 1.0) * dt;
      c.bobTimer += dt * 0.07;
      const bobY = c.y + Math.sin(c.bobTimer) * 5;
      c.container.x = c.x;
      c.container.y = bobY;

      // Gold sparkles
      if (Math.random() > 0.4) {
        const spark = new Graphics();
        spark.circle(0, 0, 1 + Math.random() * 2);
        spark.fill(Math.random() > 0.5 ? 0xFFD700 : 0xFFFFAA);
        spark.x = c.x + (Math.random() - 0.5) * 50;
        spark.y = bobY + (Math.random() - 0.5) * 30;
        this.worldContainer.addChild(spark);
        this.particles.push({
          gfx: spark, vx: -0.4, vy: -0.6,
          life: 16 + Math.random() * 10, rotSpeed: 0,
        });
      }

      const dx = c.x - heroX;
      const dy = bobY - (heroY - 30);
      if (Math.abs(dx) < 60 && Math.abs(dy) < 70) {
        c.collected = true;
        this.applyChestBonus(c.bonus);
        c.container.parent?.removeChild(c.container);
        this.chestPickups.splice(i, 1);
        continue;
      }

      if (c.x < -120) {
        c.container.parent?.removeChild(c.container);
        this.chestPickups.splice(i, 1);
      }
    }
  }

  private applyChestBonus(bonus: number) {
    // `bonus` is a score multiplier (e.g. 100 → x100). Multiplicative so the
    // banner is honest: a chest on top of a potion-grow run becomes the
    // headline payout of the round, not a rounding-error footnote.
    // Floor the pre-chest score so a chest landing on a cold run still pays.
    const CHEST_FLOOR = 10;
    const before = Math.max(this.multiplier, CHEST_FLOOR);
    const after = Math.round(before * bonus * 10) / 10;
    const gained = Math.round((after - before) * 10) / 10;
    this.multiplier = after;
    this.callbacks.onMultiplierChange(this.multiplier);

    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;

    // Huge x100 banner
    const style = new TextStyle({
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: 86,
      fontWeight: 'bold',
      fill: 0xFFD700,
      stroke: { color: 0x000000, width: 7 },
      dropShadow: { color: 0xFF8800, blur: 10, distance: 3, alpha: 0.9 },
    });
    const bigLabel = new Text({ text: `x${bonus}`, style });
    bigLabel.anchor.set(0.5);
    bigLabel.x = GAME_WIDTH / 2;
    bigLabel.y = GAME_HEIGHT / 2 - 40;
    bigLabel.scale.set(0);
    this.uiContainer.addChild(bigLabel);
    this.floatingNumbers.push({ text: bigLabel, vx: 0, vy: -0.4, life: 110, maxLife: 110 });

    this.spawnFloatingNumber(heroX, heroY - 130, `+$${gained.toFixed(0)}`, 0xFFD700);

    this.callbacks.onFlashScreen('rgba(255, 215, 0, 0.5)');
    this.triggerShake(26, 28);

    // Gold coin shower
    for (let k = 0; k < 40; k++) {
      const coin = new Graphics();
      const r = 3 + Math.random() * 4;
      coin.circle(0, 0, r);
      coin.fill(Math.random() > 0.5 ? 0xFFD700 : 0xFFE870);
      coin.x = heroX + (Math.random() - 0.5) * 120;
      coin.y = heroY - 40 - Math.random() * 60;
      this.worldContainer.addChild(coin);
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      this.particles.push({
        gfx: coin, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 5,
        life: 30 + Math.random() * 25, rotSpeed: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  // Build the floating combo label that sits above the hero while the potion is active
  private buildPotionComboLabel() {
    const style = new TextStyle({
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: 30,
      fontWeight: 'bold',
      fill: 0xFFD700,
      stroke: { color: 0x000000, width: 5 },
      dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.8 },
    });
    this.potionComboLabel = new Text({ text: 'x2', style });
    this.potionComboLabel.anchor.set(0.5, 1);
    this.potionComboLabel.visible = false;
    this.uiContainer.addChild(this.potionComboLabel);
  }

  private updatePotionComboLabel(dt: number) {
    const active = this.potionPhase === 'grow' || this.potionPhase === 'hold';
    if (!active) {
      this.potionComboLabel.visible = false;
      return;
    }
    this.potionComboLabel.visible = true;
    const label = this.potionComboKills > 0
      ? `x${POTION_KILL_MULT}  +$${(this.potionComboX).toFixed(1)}`
      : `x${POTION_KILL_MULT}`;
    this.potionComboLabel.text = label;
    // Hover it well above the (potentially giant) hero sprite
    const giantOffset = this.heroEntity.container.scale.x > 1.2 ? 220 : 90;
    this.potionComboLabel.x = 160;
    this.potionComboLabel.y = this.heroBaseY - giantOffset;
    // Tiny pulse
    const pulse = 1 + Math.sin((this.potionTimer + this.potionComboKills * 6) * 0.25) * 0.08;
    this.potionComboLabel.scale.set(pulse);
    // Suppress unused dt
    void dt;
  }

  // ─── Potion effect application (called once the pickup is collected) ───
  private applyPotion(multBoost: number) {
    // Multiplier boost
    this.multiplier = Math.round((this.multiplier + multBoost) * 10) / 10;
    this.callbacks.onMultiplierChange(this.multiplier);

    // Stacking peak — each subsequent potion in the same round doubles the
    // previous peak. 1st: base × 1, 2nd: base × 2, 3rd: base × 4, etc. The
    // user explicitly approved going off-screen for the dramatic look.
    this.potionsThisRound++;
    this.currentPotionPeak = POTION_SCALE_PEAK * Math.pow(2, this.potionsThisRound - 1);

    // Hero grow tween kicks off
    this.potionPhase = 'grow';
    this.potionTimer = 0;
    this.potionComboKills = 0;
    this.potionComboX = 0;

    // Feedback
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;
    this.callbacks.onFlashScreen('rgba(120, 220, 120, 0.45)');
    this.spawnFloatingNumber(heroX, heroY - 90, 'GULP!', 0x66FF66);
    this.spawnFloatingNumber(heroX - 20, heroY - 60, `+$${multBoost.toFixed(1)}`, 0xFFD700);
    this.triggerShake(8, 14);

    // Sparkle particles around hero
    const sparkleColors = [0x66FF66, 0xAAFF44, 0xFFFFFF, 0xD0FF88];
    for (let i = 0; i < 24; i++) {
      const gfx = new Graphics();
      const size = 2 + Math.random() * 4;
      gfx.circle(0, 0, size);
      gfx.fill(sparkleColors[Math.floor(Math.random() * sparkleColors.length)]);
      gfx.x = heroX + (Math.random() - 0.5) * 80;
      gfx.y = heroY - Math.random() * 100;
      this.worldContainer.addChild(gfx);
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        gfx, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3,
        life: 20 + Math.random() * 15, rotSpeed: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  private updatePotionTween(dt: number) {
    if (this.potionPhase === 'idle') return;
    this.potionTimer += dt;
    const hero = this.heroEntity.container;
    if (this.potionPhase === 'grow') {
      const t = Math.min(1, this.potionTimer / POTION_GROW_F);
      const s = 1 + (this.currentPotionPeak - 1) * this.easeOutBack(t);
      hero.scale.set(s);
      hero.y += (s - 1) * POTION_FOOT_ANCHOR_OFFSET;
      if (t >= 1) { this.potionPhase = 'hold'; this.potionTimer = 0; }
    } else if (this.potionPhase === 'hold') {
      const s = hero.scale.x;
      hero.y += (s - 1) * POTION_FOOT_ANCHOR_OFFSET;
      if (this.potionTimer >= POTION_HOLD_F) { this.potionPhase = 'shrink'; this.potionTimer = 0; }
    } else if (this.potionPhase === 'shrink') {
      const t = Math.min(1, this.potionTimer / POTION_SHRINK_F);
      const s = this.currentPotionPeak - (this.currentPotionPeak - 1) * t;
      hero.scale.set(s);
      hero.y += (s - 1) * POTION_FOOT_ANCHOR_OFFSET;
      if (t >= 1) {
        hero.scale.set(1);
        this.potionPhase = 'idle';
        this.potionTimer = 0;
      }
    }
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // ─── Castle backdrop fade ───────────────────────────────────
  private updateCastleFade(dt: number) {
    if (Math.abs(this.castleCurrent - this.castleTarget) < 0.01) {
      this.castleCurrent = this.castleTarget;
      this.castleOverlay.alpha = this.castleCurrent;
      return;
    }
    const step = dt / CASTLE_FADE_F;
    if (this.castleCurrent < this.castleTarget) {
      this.castleCurrent = Math.min(this.castleTarget, this.castleCurrent + step);
    } else {
      this.castleCurrent = Math.max(this.castleTarget, this.castleCurrent - step);
    }
    this.castleOverlay.alpha = this.castleCurrent;
  }

  // ─── Demo Sequence ──────────────────────────────────────────
  startDemoRound() {
    if (this.playing) return;

    for (const e of this.enemies) this.worldContainer.removeChild(e.entity.container);
    for (const de of this.deadEnemies) de.container.parent?.removeChild(de.container);
    for (const p of this.projectiles) p.gfx.parent?.removeChild(p.gfx);
    for (const fd of this.flyingDragons) fd.container.parent?.removeChild(fd.container);
    for (const dp of this.dragonPayloads) dp.gfx.parent?.removeChild(dp.gfx);
    for (const th of this.thieves) th.entity.container.parent?.removeChild(th.entity.container);
    for (const ob of this.obstacles) ob.container.parent?.removeChild(ob.container);
    for (const pp of this.potionPickups) pp.container.parent?.removeChild(pp.container);
    for (const ch of this.chestPickups) ch.container.parent?.removeChild(ch.container);
    this.enemies = [];
    this.deadEnemies = [];
    this.projectiles = [];
    this.flyingDragons = [];
    this.dragonPayloads = [];
    this.thieves = [];
    this.obstacles = [];
    this.potionPickups = [];
    this.chestPickups = [];
    this.potionComboKills = 0;
    this.potionComboX = 0;
    this.obstacleSpawnTimer = 180;
    this.hopPhase = 'idle';
    this.hopTimer = 0;
    this.heroLaneY = GROUND_Y;
    this.heroLaneTarget = GROUND_Y;
    this.heroLaneRetargetTimer = 150;

    this.playing = true;
    this.multiplier = 0;
    this.killCount = 0;
    this.isKilling = false;
    this.swordSwingTimer = 0;
    this.swordAnimIdx = 0;
    this.heroBobTimer = 0;
    this.potionPhase = 'idle';
    this.potionTimer = 0;
    this.potionsThisRound = 0;
    this.currentPotionPeak = POTION_SCALE_PEAK;
    this.castleTarget = 0;
    this.castleCurrent = 0;
    this.castleOverlay.alpha = 0;
    this.pendingLoseRound = 0;
    this.heroEntity.container.scale.set(1);
    this.heroEntity.container.rotation = 0;
    this.heroEntity.container.alpha = 1;
    this.heroEntity.container.visible = true;
    this.heroEntity.sprite.tint = 0xFFFFFF;
    this.heroEntity.container.x = 160;
    this.heroAirborne = false;
    this.heroAirX = 0;
    this.heroDied = false;
    this.flinchTintFrames = 0;
    this.postMiniKillErosion = false;
    this._resetFinale();
    this.currentScrollSpeed = SCROLL_SPEED_STROLL;
    this.targetScrollSpeed = SCROLL_SPEED_STROLL;
    this.callbacks.onMultiplierChange(0);
    this.callbacks.onKillCountChange(0);
    this.callbacks.onStateChange('playing');

    this.setAnimation(this.heroEntity, 'front_walk');
    this.heroEntity.frameSpeed = 5;

    // Six-variant demo cycle
    const variant = this.demoRoundNum % 6;
    this.demoRoundNum++;
    this.eventQueue = this.buildBook(variant);

    // ~20% chance per run to spawn a single passing thunderstorm at some point
    // in the back half of the queue (after the intro but before the final boss).
    if (Math.random() < 0.20 && this.eventQueue.length > 6) {
      const insertMin = Math.floor(this.eventQueue.length * 0.3);
      const insertMax = Math.floor(this.eventQueue.length * 0.8);
      const insertAt = insertMin + Math.floor(Math.random() * (insertMax - insertMin));
      this.eventQueue.splice(insertAt, 0, { type: 'lightning', delay: 25 });
    }

    this.currentEventTimer = 10;
  }

  /**
   * Swap the active hero animation set. Called by playRealBook with the
   * heroId that the math-sdk book picked. Idempotent — no-op when already
   * active. Re-points heroEntity.textures and reapplies the current frame so
   * the on-screen sprite updates the same tick.
   */
  private setHero(heroId: string) {
    const set = this.heroTextureBank[heroId];
    if (!set || !this.heroEntity || this.heroEntity.textures === set) return;
    this.heroEntity.textures = set;
    this.heroTextures = set;
    const frames = set[this.heroEntity.currentAnim] ?? set['front_idle'] ?? set['front_walk'];
    if (frames && frames.length > 0) {
      this.heroEntity.frameIndex = 0;
      this.heroEntity.frameTimer = 0;
      this.heroEntity.sprite.texture = frames[0];
    }
  }

  // Path B (real-RTP demo). Plays a pre-adapted DemoEvent[] from a real
  // math-sdk book. Same setup as startDemoRound but skips the variant cycle and
  // the random storm-cloud injection (lightning beats are now book-driven).
  playRealBook(adaptedEvents: DemoEvent[], heroId?: string, mode?: string, seed = 0, paceScale = 1) {
    if (this.playing) return;
    if (heroId) this.setHero(heroId);
    this.roundSeed = seed;
    this.roundMode = mode ?? 'base';
    this.roundPaceScale = paceScale;
    // Trauma must reset or a round that ended on a hard hit (snatch leaves it
    // ~0.7) opens the NEXT round with the camera still shaking for ~1.2s.
    this.trauma = 0;
    this.shakeClock = 0;
    this.rampRemaining = 0;
    this.rampPerFrame = 0;
    this.resetDragonSnatch();
    this.calloutTimer = 0;
    this.calloutIndex = 0;
    const isChaos = mode === 'chaos';
    this.chaosGlowActive = isChaos;
    this.chaosGlowTimer = 0;
    this.chaosGlow.visible = isChaos;
    this.chaosDarkOverlay.visible = isChaos;
    this.chaosDarkOverlay.alpha = isChaos ? 0.55 : 0;
    this.chaosAmbientTimer = 0;
    this.chaosAmbientNext = 40 + Math.random() * 60;

    for (const e of this.enemies) this.worldContainer.removeChild(e.entity.container);
    for (const de of this.deadEnemies) de.container.parent?.removeChild(de.container);
    for (const p of this.projectiles) p.gfx.parent?.removeChild(p.gfx);
    for (const fd of this.flyingDragons) fd.container.parent?.removeChild(fd.container);
    for (const dp of this.dragonPayloads) dp.gfx.parent?.removeChild(dp.gfx);
    for (const th of this.thieves) th.entity.container.parent?.removeChild(th.entity.container);
    for (const ob of this.obstacles) ob.container.parent?.removeChild(ob.container);
    for (const pp of this.potionPickups) pp.container.parent?.removeChild(pp.container);
    for (const ch of this.chestPickups) ch.container.parent?.removeChild(ch.container);
    this.enemies = [];
    this.deadEnemies = [];
    this.projectiles = [];
    this.flyingDragons = [];
    this.dragonPayloads = [];
    this.thieves = [];
    this.obstacles = [];
    this.potionPickups = [];
    this.chestPickups = [];
    this.potionComboKills = 0;
    this.potionComboX = 0;
    this.obstacleSpawnTimer = 180;
    this.hopPhase = 'idle';
    this.hopTimer = 0;
    this.heroLaneY = GROUND_Y;
    this.heroLaneTarget = GROUND_Y;
    this.heroLaneRetargetTimer = 150;

    this.playing = true;
    this.multiplier = 0;
    this.killCount = 0;
    this.isKilling = false;
    this.swordSwingTimer = 0;
    this.swordAnimIdx = 0;
    this.heroBobTimer = 0;
    this.potionPhase = 'idle';
    this.potionTimer = 0;
    this.potionsThisRound = 0;
    this.currentPotionPeak = POTION_SCALE_PEAK;
    this.castleTarget = 0;
    this.castleCurrent = 0;
    this.castleOverlay.alpha = 0;
    this.pendingLoseRound = 0;
    this.heroEntity.container.scale.set(1);
    this.heroEntity.container.rotation = 0;
    this.heroEntity.container.alpha = 1;
    this.heroEntity.container.visible = true;
    this.heroEntity.sprite.tint = 0xFFFFFF;
    this.heroEntity.container.x = 160;
    this.heroAirborne = false;
    this.heroAirX = 0;
    this.heroDied = false;
    this.flinchTintFrames = 0;
    this.postMiniKillErosion = false;
    this._resetFinale();
    this.currentScrollSpeed = SCROLL_SPEED_STROLL;
    this.targetScrollSpeed = SCROLL_SPEED_STROLL;
    this.callbacks.onMultiplierChange(0);
    this.callbacks.onKillCountChange(0);
    this.callbacks.onStateChange('playing');

    this.setAnimation(this.heroEntity, 'front_walk');
    this.heroEntity.frameSpeed = 5;

    this.eventQueue = adaptedEvents;
    this.currentEventTimer = 10;
  }

  // Every round opens with a slow intro → speed-up → guaranteed light trickle.
  // The rest of the run is variant-specific.
  private buildBook(variant: number): DemoEvent[] {
    const intro: DemoEvent[] = [
      { type: 'speed_change', delay: 90, speedTier: 'stroll' },           // slow opening beat (~1.5s of scenery)
      { type: 'speed_change', delay: 20, speedTier: 'run' },              // ramp up
      { type: 'trickle', delay: 55, count: 3, killValue: 22 },          // always a couple of enemies ($22/kill)
    ];

    switch (variant) {
      case 0: // WIN-BIG — dream run, horde + potion + both bosses fall
        return [
          ...intro,
          { type: 'quiet', delay: 60 },
          { type: 'big_kill', delay: 70, killValue: 160 },
          { type: 'quiet', delay: 50 },
          { type: 'potion', delay: 45, multBoost: 80 },
          { type: 'speed_change', delay: 20, speedTier: 'sprint' },
          { type: 'trickle', delay: 55, count: 4, killValue: 35 },
          { type: 'horde', delay: 50, count: 70, killValue: 14 },
          { type: 'flying_dragon', delay: 75, attackType: 'fireball', moneyLoss: 80 },
          { type: 'quiet', delay: 45 },
          { type: 'chest', delay: 75, bonus: CHEST_BONUS },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'powerdown', delay: 85, flavour: 'thief' },
          { type: 'quiet', delay: 50 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'mini_boss', delay: 90, outcome: 'win', bonus: 300 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'quiet', delay: 70 },
          { type: 'trickle', delay: 55, count: 5, killValue: 30 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'quiet', delay: 60 },
          { type: 'boss', delay: 60, killValue: 600, outcome: 'win' },
        ];

      case 1: // WIN-STEADY — tidy moderate run, no horde
        return [
          ...intro,
          { type: 'quiet', delay: 70 },
          { type: 'trickle', delay: 55, count: 3, killValue: 22 },
          { type: 'big_kill', delay: 70, killValue: 140 },
          { type: 'quiet', delay: 60 },
          { type: 'potion', delay: 45, multBoost: 40 },
          { type: 'speed_change', delay: 20, speedTier: 'sprint' },
          { type: 'trickle', delay: 55, count: 4, killValue: 28 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'powerdown', delay: 85, flavour: 'trap' },
          { type: 'quiet', delay: 60 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'mini_boss', delay: 80, outcome: 'win', bonus: 180 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'quiet', delay: 60 },
          { type: 'spell_attack', delay: 45 },
          { type: 'trickle', delay: 55, count: 4, killValue: 28 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'quiet', delay: 60 },
          { type: 'boss', delay: 60, killValue: 300, outcome: 'win' },
        ];

      case 2: // WIN-ROLLERCOASTER — up-down-up, lots of events
        return [
          ...intro,
          { type: 'quiet', delay: 55 },
          { type: 'big_kill', delay: 65, killValue: 150 },
          { type: 'flying_dragon', delay: 70, attackType: 'poop', moneyLoss: 40 },
          { type: 'potion', delay: 45, multBoost: 60 },
          { type: 'speed_change', delay: 20, speedTier: 'sprint' },
          { type: 'trickle', delay: 50, count: 3, killValue: 30 },
          { type: 'powerdown', delay: 80, flavour: 'curse' },
          { type: 'quiet', delay: 60 },
          { type: 'horde', delay: 45, count: 50, killValue: 14 },
          { type: 'flying_dragon', delay: 70, attackType: 'fireball', moneyLoss: 100 },
          { type: 'powerdown', delay: 85, flavour: 'thief' },
          { type: 'quiet', delay: 55 },
          { type: 'potion', delay: 45, multBoost: 70 },
          { type: 'chest', delay: 70, bonus: 200 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'mini_boss', delay: 80, outcome: 'win', bonus: 220 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'quiet', delay: 60 },
          { type: 'boss', delay: 60, killValue: 400, outcome: 'win' },
        ];

      case 3: // WIN-SCRAPING — barely win, lots of setbacks
        return [
          ...intro,
          { type: 'quiet', delay: 60 },
          { type: 'powerdown', delay: 80, flavour: 'trap' },
          { type: 'quiet', delay: 55 },
          { type: 'trickle', delay: 55, count: 4, killValue: 22 },
          { type: 'big_kill', delay: 65, killValue: 120 },
          { type: 'powerdown', delay: 80, flavour: 'curse' },
          { type: 'quiet', delay: 60 },
          { type: 'trickle', delay: 55, count: 4, killValue: 25 },
          { type: 'potion', delay: 45, multBoost: 25 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'quiet', delay: 60 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'boss', delay: 60, killValue: 200, outcome: 'win' },
        ];

      case 4: // LOSS-MINIBOSS — mid-run defeat
        return [
          ...intro,
          { type: 'quiet', delay: 55 },
          { type: 'trickle', delay: 55, count: 4, killValue: 22 },
          { type: 'big_kill', delay: 65, killValue: 140 },
          { type: 'potion', delay: 45, multBoost: 55 },
          { type: 'speed_change', delay: 20, speedTier: 'sprint' },
          { type: 'horde', delay: 45, count: 35, killValue: 14 },
          { type: 'flying_dragon', delay: 70, attackType: 'poop', moneyLoss: 60 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'powerdown', delay: 80, flavour: 'curse' },
          { type: 'quiet', delay: 55 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'mini_boss', delay: 90, outcome: 'lose', bonus: 0 },
        ];

      case 5: // LOSS-FINALBOSS — long successful run, falls at the final fight
      default:
        return [
          ...intro,
          { type: 'quiet', delay: 60 },
          { type: 'trickle', delay: 55, count: 3, killValue: 22 },
          { type: 'big_kill', delay: 65, killValue: 150 },
          { type: 'potion', delay: 45, multBoost: 65 },
          { type: 'speed_change', delay: 20, speedTier: 'sprint' },
          { type: 'horde', delay: 45, count: 50, killValue: 14 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'trickle', delay: 55, count: 4, killValue: 28 },
          { type: 'big_kill', delay: 65, killValue: 160 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'mini_boss', delay: 80, outcome: 'win', bonus: 200 },
          { type: 'speed_change', delay: 20, speedTier: 'run' },
          { type: 'quiet', delay: 55 },
          { type: 'powerdown', delay: 80, flavour: 'thief' },
          { type: 'quiet', delay: 60 },
          { type: 'speed_change', delay: 30, speedTier: 'stroll' },
          { type: 'boss', delay: 70, outcome: 'lose' },
        ];
    }
  }

  private endRound(_callerHint: boolean = true) {
    // Any score still mid-ramp must land before the result is read.
    this.flushScoreRamp();
    this.playing = false;
    this.isKilling = false;
    this.chaosGlowActive = false;
    this.chaosGlow.visible = false;
    this.chaosDarkOverlay.visible = false;
    this.heroEntity.container.y = this.heroBaseY;
    this.setAnimation(this.heroEntity, 'front_idle');
    this.callbacks.onStateChange('result');
    const won = this.multiplier > 0;
    this.callbacks.onResultData({ multiplier: this.multiplier, kills: this.killCount, won, heroDied: this.heroDied });
  }

  // ─── Round-end finales (banked-score, no boss) ──────────────────
  private _resetFinale() {
    if (this.finaleEnemy) {
      this.finaleEnemy.entity.container.parent?.removeChild(this.finaleEnemy.entity.container);
      this.finaleEnemy = null;
    }
    if (this.finaleDragon) {
      this.finaleDragon.container.parent?.removeChild(this.finaleDragon.container);
      this.finaleDragon = null;
    }
    if (this.finaleCliff) {
      this.finaleCliff.parent?.removeChild(this.finaleCliff);
      this.finaleCliff = null;
    }
    this.finaleActive = false;
    this.finaleFlavour = null;
    this.finaleTimer = 0;
    this.finaleHeroDying = false;
  }

  private _startFinale() {
    // Mode-aware pool. The dragon carry and the ambush snatch are now the same
    // staging, so offering both in a mode that already has the snatch made a
    // dragon take the hero in 33.5% of base rounds — it stopped reading as a
    // signature moment and started reading as the default ending.
    //
    // `base` is the only mode the contract lets emit ambushDeath, so it already
    // gets the snatch at ~22% (comparable to Drop the Boss's 1-in-5 eagle) and
    // drops the carry from its finale pool. `ante`/`chaos` never see an ambush,
    // so the carry is the only way the dragon exists there at all — keep it.
    const choices: Array<'dragon_carry' | 'gates_sealed' | 'sinkhole' | 'sword_shatter'> =
      this.roundMode === 'base'
        ? ['gates_sealed', 'sinkhole', 'sword_shatter']
        : ['dragon_carry', 'gates_sealed', 'sinkhole', 'sword_shatter'];
    // `?finale=dragon_carry` pins the pick so a specific close-out can be
    // iterated on without reloading until the 1-in-4 comes up.
    const forced = FORCED_FINALE as (typeof choices)[number] | null;
    this.finaleFlavour =
      forced && choices.includes(forced)
        ? forced
        : choices[Math.floor(Math.random() * choices.length)];
    this.finaleActive = true;
    this.finaleTimer = 0;
    this.targetScrollSpeed = SCROLL_SPEED_STROLL;
    this.isKilling = false;
  }

  private _updateGatesSealed(_dt: number) {
    const t = this.finaleTimer;
    // Phase 0: castle fades in
    if (t < 30) {
      this.castleTarget = 0.85;
    }
    // Phase 1: banner + shake
    if (t >= 30 && t < 32) {
      this.spawnBanner('GATES SEALED', 0xFFAA22, 50, 90);
      this.triggerShake(8, 18);
      this.callbacks.onFlashScreen('rgba(80, 60, 30, 0.3)');
    }
    // Phase 2: hero stops, turns front, scroll halts
    if (t >= 70 && t < 72) {
      this.targetScrollSpeed = 0;
      this.setAnimation(this.heroEntity, 'front_idle');
    }
    // Phase 3: end round
    if (t >= 130) {
      this.endRound();
    }
  }

  /**
   * Dragon-snatch ambush death.
   *
   * Staged against Drop the Boss's eagle death (900ms, zero telegraph, three
   * linear tweens) — but deliberately longer and more signposted. In a no-input
   * game the player can never be at fault, so the whole fairness burden lands on
   * legibility: the only question they can ask is "did I SEE what happened?".
   * Single-channel telegraphs are fragile, so the wind-up runs on three at once
   * (ground shadow, sky darkening, hero head-up).
   *
   * Beat sheet (frames @60):
   *    0- 27  TELEGRAPH  shadow blooms + sky darkens + unease tremor
   *   27- 43  DIVE       linear — linear reads as speed, not animation
   *   43- 58  GRAB       hit-stop: flash, hard shake, claw closes, hero hidden
   *   58- 88  ASCENT     ease-in — accelerating away sells lift against gravity
   *   88-109  AFTERMATH  helmet falls and bounces on an empty arena
   *
   * No struggle beat anywhere: any "almost got free" frame would imply an input
   * existed. Terminal from first contact.
   */
  private static readonly SNATCH_TELEGRAPH = 27;
  private static readonly SNATCH_DIVE_END = 43;
  private static readonly SNATCH_GRAB_END = 58;
  private static readonly SNATCH_ASCENT_END = 88;
  private static readonly SNATCH_TOTAL = 109;

  /**
   * The hero's visible ground line.
   *
   * `heroBaseY` is the SPRITE-FRAME baseline; the 4x16 sheets carry ~70px of
   * empty space below the character (the same gap POTION_FOOT_ANCHOR_OFFSET
   * compensates for). Anything positioned off heroBaseY lands in the dirt path
   * roughly 70px below the hero's actual feet — which is where the snatch's
   * shadow, impact flash, death particles and dropped helmet were all landing,
   * ~200px away from the dragon's claws, reading as unrelated events.
   */
  private get heroVisualY(): number {
    return this.heroBaseY - 66;
  }

  private startDragonSnatch(bannerText = 'SNATCHED!') {
    this.snatchActive = true;
    this.snatchTimer = 0;
    this.snatchBanner = bannerText;
    this.snatchHeroX = this.heroEntity.container.x;

    const shadow = new Graphics();
    shadow.ellipse(0, 0, 10, 4).fill({ color: 0x000000, alpha: 0.45 });
    shadow.x = this.heroEntity.container.x;
    shadow.y = this.heroVisualY - 2;
    this.worldContainer.addChild(shadow);
    this.snatchShadow = shadow;

    const entity = this.createAnimatedEntity(this.bigEnemyTextureBank[0], ENEMY_SCALE * 1.9, true);
    this.setAnimation(entity, 'left_walk');
    entity.frameSpeed = 2; // faster flap than the finale carry — this is a dive
    entity.sprite.tint = 0x9A6644;
    entity.container.x = GAME_WIDTH + 110;
    entity.container.y = -200;
    entity.container.visible = false; // held back through the telegraph
    this.worldContainer.addChild(entity.container);
    this.snatchDragon = entity;

    // Barely-perceptible unease tremor — the camera knows before the player does.
    this.triggerShake(3, 26);
  }

  private updateDragonSnatch(dt: number) {
    if (!this.snatchActive) return;
    const t = this.snatchTimer;
    this.snatchTimer += dt;

    const TEL = SlayTheBeastGame.SNATCH_TELEGRAPH;
    const DIVE = SlayTheBeastGame.SNATCH_DIVE_END;
    const GRAB = SlayTheBeastGame.SNATCH_GRAB_END;
    const ASC = SlayTheBeastGame.SNATCH_ASCENT_END;

    const heroX = this.snatchHeroX;
    const heroY = this.heroVisualY;
    const d = this.snatchDragon;
    if (!d) return;

    // ── Phase 0: telegraph ──────────────────────────────────────────────
    // Shadow is the load-bearing channel: it darkens AND grows as the thing
    // above descends (the alpha↔height coupling real 3D games use for altitude).
    if (this.snatchShadow) {
      const k = Math.min(1, t / DIVE);
      this.snatchShadow.clear();
      this.snatchShadow
        .ellipse(0, 0, 10 + k * 64, 4 + k * 21)
        .fill({ color: 0x000000, alpha: 0.15 + k * 0.42 });
      this.snatchShadow.x = heroX;
    }
    if (t < TEL) {
      // Sky sinks ~8% — read subliminally, not as an effect.
      this.chaosDarkOverlay.visible = true;
      this.chaosDarkOverlay.alpha = Math.max(this.chaosDarkOverlay.alpha, (t / TEL) * 0.16);
      if (t >= TEL - 12) this.setAnimation(this.heroEntity, 'back_idle'); // head-up
      return;
    }

    d.container.visible = true;
    this.updateAnimation(d, dt);

    // ── Phase 1: dive ───────────────────────────────────────────────────
    // Linear on purpose. Drop the Boss's eagle is pure linear and it reads as
    // raw speed; easing here would make it look like an animation playing.
    if (t < DIVE) {
      const k = (t - TEL) / (DIVE - TEL);
      d.container.x = GAME_WIDTH + 110 + (heroX + 40 - (GAME_WIDTH + 110)) * k;
      d.container.y = -200 + (heroY - 190 - -200) * k;
    }

    // ── Phase 2: the grab (hit-stop) ────────────────────────────────────
    if (t >= DIVE && t - dt < DIVE) {
      this.spawnImpactFlash(heroX, heroY - 60);
      this.spawnDeathParticles(heroX, heroY - 50, 16, [0x9A6644, 0xCCAA88, 0xFFFFFF]);
      this.triggerShake(24, 20);
      this.callbacks.onFlashScreen('rgba(255, 255, 255, 0.45)');
      this.spawnBanner(this.snatchBanner, 0xBB55DD, 50, 66);
      this.heroEntity.container.visible = false;
      if (this.snatchShadow) {
        this.snatchShadow.parent?.removeChild(this.snatchShadow);
        this.snatchShadow = null;
      }
      // Helmet left behind — the permanence beat lands in phase 4.
      const helm = new Graphics();
      helm.ellipse(0, 0, 13, 9).fill(0xB8B8C0);
      helm.rect(-4, -13, 8, 7).fill(0xCC2222);
      helm.x = heroX;
      helm.y = heroY - 300;
      this.worldContainer.addChild(helm);
      this.snatchHelm = helm;
    }
    // Hold on the contact frame. World is already halted (queue cleared), so the
    // freeze reads as impact weight rather than a stutter.
    if (t >= DIVE && t < GRAB) {
      d.container.x = heroX + 40;
      d.container.y = heroY - 190;
    }

    // ── Phase 3: ascent ─────────────────────────────────────────────────
    if (t >= GRAB && t < ASC) {
      const k = (t - GRAB) / (ASC - GRAB);
      const ease = k * k;                        // accelerating = working against gravity
      d.container.x = heroX + 40 + ease * 210;
      d.container.y = heroY - 190 - ease * 780;
      // One height scalar drives lift AND scale, so it reads as receding.
      const s = ENEMY_SCALE * 1.9 * (1 - ease * 0.58);
      d.container.scale.set(s, s);
    }

    // ── Phase 4: aftermath ──────────────────────────────────────────────
    if (t >= ASC) {
      if (d.container.visible) d.container.visible = false;
      // Helmet drops and bounces — proof the hero was really here.
      if (this.snatchHelm) {
        const k = Math.min(1, (t - ASC) / 16);
        const fall = k * k;
        const bounce = t > ASC + 16 ? Math.abs(Math.sin((t - ASC - 16) * 0.42)) * 16 * (1 - Math.min(1, (t - ASC - 16) / 18)) : 0;
        this.snatchHelm.y = (heroY - 300) + fall * 300 - bounce;
        this.snatchHelm.rotation = fall * 2.4;
      }
      // Release the telegraph darkening.
      if (!this.chaosGlowActive) {
        this.chaosDarkOverlay.alpha = Math.max(0, this.chaosDarkOverlay.alpha - 0.012 * dt);
        if (this.chaosDarkOverlay.alpha <= 0) this.chaosDarkOverlay.visible = false;
      }
    }
  }

  private resetDragonSnatch() {
    this.snatchActive = false;
    this.snatchTimer = 0;
    if (this.snatchDragon) {
      this.snatchDragon.container.parent?.removeChild(this.snatchDragon.container);
      this.snatchDragon = null;
    }
    if (this.snatchShadow) {
      this.snatchShadow.parent?.removeChild(this.snatchShadow);
      this.snatchShadow = null;
    }
    if (this.snatchHelm) {
      this.snatchHelm.parent?.removeChild(this.snatchHelm);
      this.snatchHelm = null;
    }
    this.heroEntity.container.rotation = 0;
  }

  /**
   * Dragon-carry finale — now the SAME staging as the ambush dragon snatch.
   *
   * Under the banked-score model these two outcomes are semantically identical:
   * a dragon takes the hero, the round ends, and whatever score was accumulated
   * is banked. They were rendered completely differently (this one was three
   * linear lerps with no telegraph, no hit-stop and no aftermath) purely because
   * they were written months apart. Identical outcomes should read identically.
   *
   * The only difference kept is the banner: 'CARRIED AWAY!' frames this as the
   * natural end of a run, versus 'SNATCHED!' for a sudden interruption.
   *
   * This is also what puts the dragon into ante and chaos, where the contract
   * forbids ambushDeath outright — the finale terminal is reachable in every mode.
   *
   * updateDragonSnatch() is driven from the always-run block of update(), so this
   * only has to kick it off and watch for completion.
   */
  private _updateDragonCarry(_dt: number) {
    if (!this.snatchActive && this.finaleTimer < 2) {
      this.startDragonSnatch('CARRIED AWAY!');
      this.targetScrollSpeed = SCROLL_SPEED_STROLL;
    }
    if (this.snatchTimer >= SlayTheBeastGame.SNATCH_TOTAL) {
      this.endRound();
    }
  }

  private _updateSinkhole(_dt: number) {
    const t = this.finaleTimer;
    const heroX = this.heroEntity.container.x;
    const groundY = this.heroBaseY;

    // Phase 0: banner + spawn dark ellipse beneath the hero (small)
    if (t < 1) {
      this.heroDied = true;
      this.spawnBanner('SINKHOLE!', 0x553322, 50, 90);
      this.triggerShake(4, 8);
      const gfx = new Graphics();
      gfx.ellipse(0, 0, 8, 3).fill(0x000000);
      gfx.x = heroX;
      gfx.y = groundY - 4;
      this.worldContainer.addChild(gfx);
      this.finaleCliff = gfx; // re-using the field as a generic finale-Graphics handle
      this.targetScrollSpeed = 0;
    }

    // Phase 1 (1-30): hole grows
    if (this.finaleCliff && t < 30) {
      const k = t / 30;
      this.finaleCliff.clear();
      const rx = 8 + k * 90;
      const ry = 3 + k * 30;
      this.finaleCliff.ellipse(0, 0, rx, ry).fill(0x000000);
    }

    // Phase 2 (15-70): hero sinks (vertical squash + descend)
    if (t >= 15 && t < 70) {
      const k = (t - 15) / 55;
      const hero = this.heroEntity.container;
      hero.scale.y = Math.max(0.05, 1 - k);
      hero.y = groundY + k * 40;
      hero.rotation = Math.sin(t * 0.18) * 0.08 * (1 - k);
    }

    // Phase 3 (70-95): hero alpha fades; ground hole stays visible
    if (t >= 70 && t < 95) {
      const k = (t - 70) / 25;
      this.heroEntity.container.alpha = Math.max(0, 1 - k);
    }

    // Phase 4 (95+): end round
    if (t >= 95) {
      this.endRound();
    }
  }

  private _updateSwordShatter(dt: number) {
    const t = this.finaleTimer;
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroBaseY;

    // Phase 0: shard burst + banner
    if (t < 1) {
      this.heroDied = true;
      this.spawnBanner('BLADE SHATTERED!', 0xCCDDEE, 44, 80);
      this.triggerShake(6, 12);
      // 8 shard particles
      const shardColors = [0xCCCCCC, 0xAAAAAA, 0xEEEEEE, 0x888899];
      for (let i = 0; i < 10; i++) {
        const gfx = new Graphics();
        gfx.poly([0, -4, 3, 0, 0, 4, -3, 0]).fill(shardColors[i % shardColors.length]);
        gfx.x = heroX + 30;
        gfx.y = heroY - 70;
        this.worldContainer.addChild(gfx);
        const angle = (Math.random() - 0.5) * Math.PI;
        const speed = 2 + Math.random() * 4;
        this.particles.push({
          gfx, vx: Math.cos(angle) * speed, vy: -Math.abs(Math.sin(angle)) * speed - 2,
          life: 30, rotSpeed: (Math.random() - 0.5) * 0.4,
        });
      }
    }
    // Phase 1 (1-25): spawn approaching enemy off-right
    if (t >= 25 && t < 26 && !this.finaleEnemy) {
      const enemy = this.spawnBigEnemy(GAME_WIDTH + 60, ENEMY_SCALE * 2.2, 0xFF8866);
      enemy.entity.frameSpeed = 5;
      this.finaleEnemy = enemy;
      this.targetScrollSpeed = SCROLL_SPEED_STROLL;
    }
    // Phase 2 (26-90): enemy walks toward hero
    if (this.finaleEnemy && t >= 26 && t < 90) {
      this.finaleEnemy.entity.container.x -= 4.5 * dt;
      // Frame loop
      const e = this.finaleEnemy.entity;
      e.frameTimer += dt;
      if (e.frameTimer >= e.frameSpeed) {
        e.frameTimer = 0;
        e.frameIndex = (e.frameIndex + 1) % 4;
        const frames = e.textures[e.currentAnim];
        if (frames) e.sprite.texture = frames[e.frameIndex];
      }
    }
    // Phase 3: enemy reaches hero — strike
    if (t >= 90 && t < 91 && !this.finaleHeroDying) {
      this.finaleHeroDying = true;
      this.spawnBanner('SLAIN!', 0xFF3333, 60, 80);
      this.triggerShake(14, 20);
      this.callbacks.onFlashScreen('rgba(255, 50, 50, 0.55)');
      this.spawnDeathParticles(heroX, heroY - 40, 14);
    }
    // Phase 4 (90+): hero death tween (rotate + fade)
    if (t >= 90 && this.finaleHeroDying) {
      this.heroEntity.container.rotation += 0.08 * dt;
      this.heroEntity.container.scale.set(Math.max(0.3, this.heroEntity.container.scale.x - 0.02 * dt));
      this.heroEntity.container.alpha = Math.max(0, this.heroEntity.container.alpha - 0.025 * dt);
    }
    // Phase 5: end round
    if (t >= 130) {
      this.endRound();
    }
  }

  // ─── Main Update Loop ──────────────────────────────────────
  private update(dt: number) {
    if (this.flinchTintFrames > 0) {
      this.flinchTintFrames -= dt;
      if (this.flinchTintFrames <= 0) {
        this.flinchTintFrames = 0;
        this.heroEntity.sprite.tint = 0xFFFFFF;
      }
    }
    if (this.chaosGlowActive) {
      this.chaosAmbientTimer += dt;
      if (this.chaosAmbientTimer >= this.chaosAmbientNext) {
        this.chaosAmbientTimer = 0;
        this.chaosAmbientNext = 50 + Math.random() * 80;
        this.fireChaosAmbientFlash();
      }
    }
    if (!this.isKilling) {
      this.updateAnimation(this.heroEntity, dt);
    }
    this.updateHeroCombat(dt);
    this.updateHeroAirborne(dt);
    this.updateFloatingNumbers(dt);
    this.updateParticles(dt);
    this.updateDeadEnemies(dt);
    this.updateProjectiles(dt);
    this.updateFlyingDragons(dt);
    this.updateDragonPayloads(dt);
    this.updateThieves(dt);
    this.updateObstacles(dt);
    this.updateHeroHop(dt);
    this.updateHeroLane(dt);
    this.updateShake(dt);
    this.updateHeroMoneyLabel();
    this.updateCastleFade(dt);
    this.updatePotionTween(dt);
    this.updatePotionPickups(dt);
    this.updateChestPickups(dt);
    this.updatePotionComboLabel(dt);
    this.updateSkyClouds(dt);
    this.updateParallax();
    this.updateScoreRamp(dt);
    this.updateCallouts(dt);
    this.updateDragonSnatch(dt);
    this.maybeSpawnBird(dt);
    this.updateBirds(dt);
    this.updateStormClouds(dt);
    this.updateLightningBolts(dt);
    this.updateLightningMode(dt);

    if (!this.playing) return;

    // Passive tick — money creeps up as the hero keeps running (scaled by
    // current scroll speed so sprinting earns a hair more than strolling).
    // Only push the new value to Svelte when the rounded display actually
    // changes, so we don't thrash the HUD tween every frame.
    const potionActive = this.potionPhase === 'grow' || this.potionPhase === 'hold';
    const potionMult = potionActive ? POTION_KILL_MULT : 1;
    // Divided by the round's pace multiplier: the tick is per-frame, so without
    // this a 6x longer round would accrue 6x the passive score and the on-screen
    // number would drift away from the book's payoutMultiplier. Total passive
    // contribution per round stays constant however long the round is presented.
    const tickRate =
      (PASSIVE_TICK_PER_FRAME * (this.currentScrollSpeed / SCROLL_SPEED_RUN) * potionMult) /
      Math.max(0.01, this.roundPaceScale);
    const before = this.multiplier;
    const after = Math.round((this.multiplier + tickRate * dt) * 10) / 10;
    if (after !== before) {
      this.multiplier = after;
      this.callbacks.onMultiplierChange(this.multiplier);
    }

    // Pending mini-boss loss resolution
    if (this.pendingLoseRound > 0) {
      this.pendingLoseRound -= dt;
      if (this.pendingLoseRound <= 0) {
        this.pendingLoseRound = 0;
        this.endRound(false);
        return;
      }
    }

    // Lerp scroll speed toward target
    const lerpStep = (this.targetScrollSpeed - this.currentScrollSpeed) / SCROLL_RAMP_F;
    this.currentScrollSpeed += lerpStep * dt;
    this.scrollOffset += this.currentScrollSpeed * dt;

    // Process event queue
    if (this.eventQueue.length > 0 && !this.pendingWave) {
      this.currentEventTimer -= dt;
      if (this.currentEventTimer <= 0) {
        this.processEvent(this.eventQueue.shift()!);
      }
    }

    // Wind-down → start a round-end cinematic finale when the eventQueue
    // runs out for banked-score terminals (no_boss, mini_killed). Boss-kill
    // setTimeout and pendingLoseRound paths still trigger their own endRound
    // first; this is the fallback.
    if (
      this.playing &&
      !this.finaleActive &&
      this.eventQueue.length === 0 &&
      !this.pendingWave &&
      this.enemies.length === 0 &&
      this.pendingLoseRound === 0
    ) {
      if (this.windDownTimer < 0) this.windDownTimer = 26;
      this.windDownTimer -= dt;
      if (this.windDownTimer <= 0) {
        this.windDownTimer = -1;
        this._startFinale();
      }
    } else if (!this.finaleActive) {
      this.windDownTimer = -1;
    }

    // Drive the active finale, if any.
    if (this.finaleActive) {
      this.finaleTimer += dt;
      switch (this.finaleFlavour) {
        case 'dragon_carry': this._updateDragonCarry(dt); break;
        case 'gates_sealed': this._updateGatesSealed(dt); break;
        case 'sinkhole': this._updateSinkhole(dt); break;
        case 'sword_shatter': this._updateSwordShatter(dt); break;
      }
    }

    // Spawn pending wave
    if (this.pendingWave) {
      this.pendingWave.spawnTimer -= dt;
      if (this.pendingWave.spawnTimer <= 0 && this.pendingWave.remaining > 0) {
        const clusterSize = Math.min(this.pendingWave.remaining, 5 + Math.floor(Math.random() * 5));
        for (let i = 0; i < clusterSize; i++) {
          const x = GAME_WIDTH + 40 + i * 22 + Math.random() * 18;
          const enemy = this.spawnEnemy(x);
          enemy.killValue = this.pendingWave.killValue;
          this.enemies.push(enemy);
        }
        this.pendingWave.remaining -= clusterSize;
        this.pendingWave.spawnTimer = this.pendingWave.spawnDelay;
        if (this.pendingWave.remaining <= 0) this.pendingWave = null;
      }
    }

    // Move enemies and check kills
    const heroX = this.heroEntity.container.x;
    let killedThisFrame = false;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;

      // Mini-boss with miniBossWins marches more slowly + is invulnerable, then triumphs
      const isInvulnerableBoss = enemy.miniBossWins === true;
      const isBoss = enemy.isMiniBoss === true || enemy.isFinalBoss === true;
      const moveSpeed = isInvulnerableBoss ? (this.currentScrollSpeed + 1) : (this.currentScrollSpeed + 2);
      enemy.entity.container.x -= moveSpeed * dt;
      this.updateAnimation(enemy.entity, dt);

      // Boss attack cycle — swap between left_walk and left_attack while alive
      // and on screen. Once the boss has reached the hero (invulnerable path),
      // hold left_attack continuously for the SLAY beat.
      if (isBoss && enemy.attackTimer !== undefined && enemy.attackPhase !== undefined) {
        const reachedHero = enemy.entity.container.x <= heroX + KILL_RANGE;
        if (isInvulnerableBoss && reachedHero) {
          if (enemy.entity.currentAnim !== 'left_attack') {
            this.setAnimation(enemy.entity, 'left_attack');
          }
        } else {
          enemy.attackTimer -= dt;
          if (enemy.attackTimer <= 0) {
            if (enemy.attackPhase === 'walking') {
              enemy.attackPhase = 'attacking';
              enemy.attackTimer = 18;
              this.setAnimation(enemy.entity, 'left_attack');
              this.triggerShake(3, 5);
            } else {
              enemy.attackPhase = 'walking';
              enemy.attackTimer = 50 + Math.random() * 30;
              this.setAnimation(enemy.entity, 'left_walk');
            }
          }
        }
      }

      if (isInvulnerableBoss) {
        // Boss walks up to the hero and stands triumphant — round ends after buffer
        if (enemy.entity.container.x <= heroX + KILL_RANGE && this.pendingLoseRound === 0) {
          this.pendingLoseRound = MINI_BOSS_LOSE_BUFFER;
          this.heroDied = true;
          // Freeze further spawns so no late wave/event leaks into the SLAY
          // beat or the result overlay.
          this.eventQueue = [];
          this.pendingWave = null;
          this.spawnBanner('DEFEATED!', 0xFF2222, 52, 50);
          this.triggerShake(22, 28);
          this.callbacks.onFlashScreen('rgba(255, 0, 0, 0.5)');
          if (enemy.isFinalBoss) {
            // Failed final boss — climactic boss-strike sprite-shatter on the
            // hero. Distinct flavour from ambush (denser shards, slower fall,
            // larger puff) to read as annihilation rather than slip-up.
            this.spawnSpriteShatter(this.heroEntity.container, { flavour: 'bossStrike' });
            this.heroEntity.container.visible = false;
          } else {
            // Mini-boss-passed: hero loses the encounter but isn't annihilated.
            this.spawnDeathParticles(heroX, this.heroEntity.container.y - 30, 25);
          }
          // Stop the boss in place for dramatic beat
          enemy.entity.container.x = heroX + KILL_RANGE;
        }
        continue;
      }

      // Kill when entering kill range (well before reaching hero)
      if (enemy.entity.container.x <= heroX + KILL_RANGE) {
        this.killEnemy(enemy, enemy.killValue);
        killedThisFrame = true;
        // NO per-kill shake. Hordes run 41-80 enemies arriving in clusters of
        // 5-9; at trauma +0.059 per kill against a 0.0133/frame decay this
        // pinned trauma at 1.0 for seconds at a time — measured 3.3s above 0.5,
        // 24.9px displacement and 1.9 degrees of roll, through every wave. The
        // benchmark uses zero screen shake at all; shake here is reserved for
        // discrete heavy beats (big kills, boss hits, the death moment).
        this.enemies.splice(i, 1);
        continue;
      }

      if (enemy.entity.container.x < -100) {
        this.worldContainer.removeChild(enemy.entity.container);
        this.enemies.splice(i, 1);
      }
    }

    // Determine if hero should be in killing frenzy mode
    const nearbyEnemies = this.enemies.some(e => e.alive && e.entity.container.x < heroX + KILL_RANGE + 80);
    if (killedThisFrame || nearbyEnemies) {
      this.isKilling = true;
    } else if (this.isKilling) {
      // Brief cooldown before returning to walk
      this.isKilling = false;
      this.setAnimation(this.heroEntity, 'front_walk');
    }
  }

  // ─── Lightning Storm ────────────────────────────────────────
  // Storm drifts across the screen at constant speed, never stopping. As it
  // passes pre-chosen X positions, it fires bolts down: 2-3 near-misses
  // (telegraphs) before it reaches the hero, then one "decisive" strike as
  // it passes over. The decisive strike ALWAYS lands and ALWAYS resolves —
  // its outcome (95% penalty / 5% lightning_mode) is pre-rolled at spawn so
  // the renderer is pure replay. This matches the BookEventLightning contract
  // shape (every lightning event resolves; there is no "miss" outcome).
  private spawnStormCloud() {
    const container = new Container();
    const body = new Graphics();
    const puffs = 5;
    const w = 150;
    for (let j = 0; j < puffs; j++) {
      const px = (j - (puffs - 1) / 2) * (w * 0.35);
      const py = (Math.random() - 0.5) * 10;
      const r = w * (0.40 + Math.random() * 0.15);
      body.ellipse(px, py, r, r * 0.7);
    }
    body.fill({ color: 0x333844, alpha: 0.95 });
    for (let j = 0; j < puffs; j++) {
      const px = (j - (puffs - 1) / 2) * (w * 0.35);
      body.ellipse(px, 14, w * 0.38, w * 0.22);
    }
    body.fill({ color: 0x1a1a26, alpha: 0.95 });
    container.addChild(body);

    const startX = GAME_WIDTH + 160;
    const y = 80 + Math.random() * 80;
    container.x = startX;
    container.y = y;
    this.uiContainer.addChild(container);
    this.worldContainer.sortChildren();

    // Choose 2-3 near-miss trigger X positions spaced across the right half,
    // plus one decisive trigger over the hero's base X.
    const heroBaseX = 160;
    const nearCount = 2 + Math.floor(Math.random() * 2); // 2 or 3
    const strikes: Array<{
      triggerX: number;
      kind: 'near' | 'decisive';
      fired: boolean;
      outcome?: 'penalty' | 'lightning_mode';
    }> = [];
    for (let k = 0; k < nearCount; k++) {
      const t = (k + 1) / (nearCount + 1); // spread through right half of canvas
      const triggerX = GAME_WIDTH * (0.9 - t * 0.55) + (Math.random() - 0.5) * 40;
      strikes.push({ triggerX, kind: 'near', fired: false });
    }
    // Pre-roll the decisive outcome at spawn — the only RNG that touches gameplay.
    const decisiveOutcome: 'penalty' | 'lightning_mode' =
      Math.random() < LIGHTNING_MODE_CHANCE ? 'lightning_mode' : 'penalty';
    strikes.push({ triggerX: heroBaseX, kind: 'decisive', fired: false, outcome: decisiveOutcome });
    // Sort by triggerX descending — cloud moves leftward, so it hits higher X first
    strikes.sort((a, b) => b.triggerX - a.triggerX);

    this.stormClouds.push({
      container, body,
      x: startX, y,
      vx: -2.3,
      strikes,
    });
  }

  private updateStormClouds(dt: number) {
    const heroX = this.heroEntity.container.x;
    for (let i = this.stormClouds.length - 1; i >= 0; i--) {
      const c = this.stormClouds[i];
      c.x += c.vx * dt;
      c.container.x = c.x;
      // Subtle flicker so the cloud reads as electric even between strikes
      c.container.alpha = 0.92 + Math.sin(c.x * 0.08) * 0.06;

      // Fire any strikes whose trigger X the cloud has now passed
      for (const s of c.strikes) {
        if (s.fired) continue;
        if (c.x > s.triggerX) continue;
        s.fired = true;
        if (s.kind === 'near') {
          // Near-miss: lands slightly offset from cloud center — ground warning
          const boltX = c.x + (Math.random() - 0.5) * 40;
          this.fireLightningBolt(boltX, c.y + 30);
        } else {
          // Decisive: always lands on hero, always resolves the pre-rolled outcome.
          const boltX = heroX + (Math.random() - 0.5) * 24;
          this.fireLightningBolt(boltX, c.y + 30);
          this.spawnImpactBanner('DIRECT HIT!', 0xFFFFFF, -150);
          this.resolveStormStrike(s.outcome ?? 'penalty');
        }
      }

      // Off-screen left → clean up
      if (c.x < -200) {
        this.uiContainer.removeChild(c.container);
        this.stormClouds.splice(i, 1);
      }
    }
  }

  private fireLightningBolt(fromX: number, fromY: number) {
    const gfx = new Graphics();
    // Jagged polyline from cloud to ground
    let x = fromX;
    let y = fromY;
    const segs = 8;
    const step = (GROUND_Y - fromY) / segs;
    gfx.moveTo(x, y);
    for (let i = 1; i <= segs; i++) {
      x = fromX + (Math.random() - 0.5) * 36;
      y = fromY + step * i;
      gfx.lineTo(x, y);
    }
    gfx.stroke({ color: 0xFFFFFF, width: 6, alpha: 1 });
    // Inner glow pass
    gfx.stroke({ color: 0xCFE2FF, width: 2, alpha: 1 });
    this.uiContainer.addChild(gfx);
    this.lightningBolts.push({ gfx, life: 14, maxLife: 14 });
    this.callbacks.onFlashScreen('rgba(230, 240, 255, 0.8)');
    this.triggerShake(18, 18);
  }

  private fireChaosAmbientFlash() {
    const x = 40 + Math.random() * (GAME_WIDTH - 80);
    const startY = 20 + Math.random() * 80;
    const endY = startY + 120 + Math.random() * 200;
    const gfx = new Graphics();
    let cx = x;
    let cy = startY;
    const segs = 5 + Math.floor(Math.random() * 4);
    const step = (endY - startY) / segs;
    gfx.moveTo(cx, cy);
    for (let i = 1; i <= segs; i++) {
      cx = x + (Math.random() - 0.5) * 50;
      cy = startY + step * i;
      gfx.lineTo(cx, cy);
    }
    gfx.stroke({ color: 0xCCCCFF, width: 3, alpha: 0.7 });
    gfx.stroke({ color: 0xFFFFFF, width: 1, alpha: 0.9 });
    this.uiContainer.addChild(gfx);
    this.lightningBolts.push({ gfx, life: 8, maxLife: 8 });
    // Subtle flash — less intense than event-driven strikes
    this.callbacks.onFlashScreen('rgba(180, 190, 220, 0.25)');
  }

  private updateLightningBolts(dt: number) {
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const b = this.lightningBolts[i];
      b.life -= dt;
      b.gfx.alpha = Math.max(0, b.life / b.maxLife);
      if (b.life <= 0) {
        this.uiContainer.removeChild(b.gfx);
        this.lightningBolts.splice(i, 1);
      }
    }
  }

  // Apply the pre-rolled storm outcome. No RNG here — this is pure replay.
  private resolveStormStrike(outcome: 'penalty' | 'lightning_mode') {
    if (outcome === 'lightning_mode') {
      this.enterLightningMode();
    } else {
      // 95% case — halve money with a dedicated banner
      const lost = Math.round(this.multiplier / 2 * 10) / 10;
      this.multiplier = Math.round((this.multiplier - lost) * 10) / 10;
      this.callbacks.onMultiplierChange(this.multiplier);
      const heroX = this.heroEntity.container.x;
      const heroY = this.heroEntity.container.y;
      this.spawnImpactBanner('LIGHTNING STRIKE', 0xCFE2FF, -60);
      this.spawnImpactBanner('-50%', 0xFF2222, 20);
      this.spawnFloatingNumber(heroX, heroY - 130, `-$${lost.toFixed(1)}`, 0xFF2222);
      this.spawnImpactFlash(heroX, heroY - 30);
      this.spawnDeathParticles(heroX, heroY - 30, 20);
    }
  }

  // ─── Lightning Mode (buff) ──────────────────────────────────
  private enterLightningMode() {
    if (this.lightningMode) return;
    this.lightningMode = true;
    this.lightningModeTimer = 0;
    this.lightningZapTimer = 0;
    this.heroEntity.container.scale.set(LIGHTNING_MODE_SCALE);
    this.spawnImpactBanner('LIGHTNING MODE', 0xFFEE66, -60);
    this.spawnImpactBanner('POW POW!', 0xFFFFFF, 20);
    this.callbacks.onFlashScreen('rgba(255, 240, 120, 0.7)');
    this.triggerShake(22, 24);
  }

  private exitLightningMode() {
    this.lightningMode = false;
    this.lightningModeTimer = 0;
    this.heroEntity.container.scale.set(1);
    // Clean up any live crackles
    for (const c of this.lightningCrackles) {
      if (c.gfx.parent) c.gfx.parent.removeChild(c.gfx);
    }
    this.lightningCrackles.length = 0;
  }

  private updateLightningMode(dt: number) {
    // Decay live crackles regardless of mode (so they fade after exit)
    for (let i = this.lightningCrackles.length - 1; i >= 0; i--) {
      const c = this.lightningCrackles[i];
      c.life -= dt;
      c.gfx.alpha = Math.max(0, c.life / 8);
      if (c.life <= 0) {
        if (c.gfx.parent) c.gfx.parent.removeChild(c.gfx);
        this.lightningCrackles.splice(i, 1);
      }
    }

    if (!this.lightningMode) return;

    this.lightningModeTimer += dt;
    this.lightningZapTimer += dt;

    // Spawn crackling sparks around the hero every few frames
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;
    if (Math.random() < 0.5) {
      const cgfx = new Graphics();
      const ax = heroX + (Math.random() - 0.5) * 110;
      const ay = heroY - 40 - Math.random() * 120;
      let px = ax, py = ay;
      cgfx.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        px += (Math.random() - 0.5) * 22;
        py += (Math.random() - 0.5) * 22;
        cgfx.lineTo(px, py);
      }
      cgfx.stroke({ color: 0xFFFFAA, width: 2 });
      this.uiContainer.addChild(cgfx);
      this.lightningCrackles.push({ gfx: cgfx, life: 8 });
    }

    // Auto-zap — every LIGHTNING_ZAP_INTERVAL frames, kill the frontmost live enemy
    if (this.lightningZapTimer >= LIGHTNING_ZAP_INTERVAL) {
      this.lightningZapTimer = 0;
      this.zapNearestEnemy();
    }

    if (this.lightningModeTimer >= LIGHTNING_MODE_F) {
      this.exitLightningMode();
    }
  }

  private zapNearestEnemy() {
    // Find the closest live enemy in front of the hero
    const heroX = this.heroEntity.container.x;
    const heroY = this.heroEntity.container.y;
    let target: Enemy | null = null;
    let bestDx = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.entity.container.x - heroX;
      if (dx > 0 && dx < 900 && dx < bestDx) {
        bestDx = dx;
        target = e;
      }
    }
    if (!target) return;

    // Draw a jagged lightning arc from hero to enemy
    const ex = target.entity.container.x;
    const ey = target.entity.container.y - 40;
    const arc = new Graphics();
    let x = heroX, y = heroY - 60;
    const segs = 6;
    arc.moveTo(x, y);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const bx = heroX + (ex - heroX) * t + (Math.random() - 0.5) * 22;
      const by = (heroY - 60) + (ey - (heroY - 60)) * t + (Math.random() - 0.5) * 22;
      arc.lineTo(bx, by);
    }
    arc.stroke({ color: 0xFFFFFF, width: 5 });
    arc.stroke({ color: 0xCFE2FF, width: 2 });
    this.uiContainer.addChild(arc);
    this.lightningCrackles.push({ gfx: arc, life: 8 });

    // Kill the enemy with a banner payout
    target.alive = false;
    this.killCount++;
    this.callbacks.onKillCountChange(this.killCount);
    const zapValue = Math.max(8, target.killValue);
    this.multiplier = Math.round((this.multiplier + zapValue) * 10) / 10;
    this.callbacks.onMultiplierChange(this.multiplier);
    this.spawnFloatingNumber(
      target.entity.container.x,
      target.entity.container.y - 50,
      `+$${zapValue.toFixed(1)}⚡`,
      0xFFEE66,
    );
    this.spawnImpactFlash(target.entity.container.x, target.entity.container.y - 30);
    this.spawnDeathParticles(target.entity.container.x, target.entity.container.y - 30, 10);
    // Remove from world
    if (target.entity.container.parent) {
      target.entity.container.parent.removeChild(target.entity.container);
    }
  }

  private spawnImpactBanner(text: string, color: number, yOffset: number) {
    const style = new TextStyle({
      fontFamily: 'Impact, Arial Black, sans-serif', fontSize: 78, fontWeight: 'bold',
      fill: color, stroke: { color: 0x000000, width: 10 },
      dropShadow: { color: 0x000000, blur: 6, distance: 4, alpha: 0.85 },
      letterSpacing: 2,
    });
    const t = new Text({ text, style });
    t.anchor.set(0.5);
    t.x = GAME_WIDTH / 2;
    t.y = GAME_HEIGHT / 2 + yOffset;
    t.scale.set(0);
    this.uiContainer.addChild(t);
    this.floatingNumbers.push({ text: t, vx: 0, vy: -0.15, life: 60, maxLife: 60 });
  }

  private spawnBanner(text: string, color: number, fontSize: number, life: number) {
    const style = new TextStyle({
      fontFamily: 'Impact, Arial Black, sans-serif', fontSize, fontWeight: 'bold',
      fill: color, stroke: { color: 0x000000, width: 6 },
      dropShadow: { color: 0x000000, blur: 4, distance: 2, alpha: 0.7 },
    });
    const t = new Text({ text, style });
    t.anchor.set(0.5);
    t.x = GAME_WIDTH / 2;
    t.y = GAME_HEIGHT / 2 - 80;
    t.scale.set(0);
    this.uiContainer.addChild(t);
    this.floatingNumbers.push({ text: t, vx: 0, vy: -0.3, life, maxLife: life });
  }

  private processEvent(event: DemoEvent) {
    if (TRACE_EVENTS) {
      console.log(`[ev] ${event.type} delay=${event.delay} remaining=${this.eventQueue.length}`);
    }
    switch (event.type) {
      case 'quiet':
        // Pure running beat — nothing happens, just scenery + hero walking
        this.currentEventTimer = event.delay;
        break;

      case 'speed_change': {
        const tier = event.speedTier ?? 'run';
        this.targetScrollSpeed =
          tier === 'stroll' ? SCROLL_SPEED_STROLL :
          tier === 'sprint' ? SCROLL_SPEED_SPRINT :
          SCROLL_SPEED_RUN;
        this.currentEventTimer = event.delay;
        break;
      }

      case 'trickle':
        this.pendingWave = {
          remaining: event.count!, killValue: event.killValue!,
          spawnDelay: TRICKLE_SPAWN_DELAY, spawnTimer: 0,
        };
        this.currentEventTimer = event.delay;
        break;

      case 'horde':
        this.pendingWave = {
          remaining: event.count!, killValue: event.killValue!,
          spawnDelay: HORDE_SPAWN_DELAY, spawnTimer: 0,
        };
        this.spawnBanner('LUCKY HORDE!', 0xFFD700, 44, 60);
        this.triggerShake(6, 15);
        this.callbacks.onFlashScreen('rgba(255, 215, 0, 0.25)');
        this.currentEventTimer = event.delay;
        break;

      case 'big_kill': {
        const bigEnemy = this.spawnBigEnemy(GAME_WIDTH + 60, ENEMY_SCALE * 2.5, 0xFF6644);
        bigEnemy.killValue = event.killValue!;
        this.enemies.push(bigEnemy);
        this.currentEventTimer = event.delay;
        break;
      }

      case 'spell_attack':
        this.spawnSpellProjectile();
        this.currentEventTimer = event.delay;
        break;

      case 'lightning':
        this.spawnStormCloud();
        this.currentEventTimer = event.delay;
        break;

      case 'potion':
        this.spawnPotionPickup(event.multBoost!);
        this.currentEventTimer = event.delay;
        break;

      case 'chest':
        this.spawnChestPickup(event.bonus ?? CHEST_BONUS);
        this.currentEventTimer = event.delay;
        break;

      case 'powerdown':
        if (this.postMiniKillErosion) {
          this.playWoundedFlinch();
          this.postMiniKillErosion = false;
        }
        this.applyPowerdown(event.flavour!, event.scoreLoss);
        this.currentEventTimer = event.delay;
        break;

      case 'mini_boss': {
        // Castle backdrop fades in
        this.castleTarget = 0.85;
        this.spawnBanner('BOSS!', 0xFF2200, 52, 60);
        this.triggerShake(12, 22);
        this.callbacks.onFlashScreen('rgba(120, 40, 80, 0.3)');

        const boss = this.spawnBossEnemy(GAME_WIDTH + 80, 460);
        boss.isMiniBoss = true;
        if (event.outcome === 'win') {
          boss.killValue = event.bonus ?? 6;
          // Arm erosion detection — math-sdk emits at most one
          // powerdown/lightning_penalty/flying_dragon after a kept mini-boss
          // kill; playWoundedFlinch will fire on that event to anchor the
          // score loss to the hero rather than letting it read as silent decay.
          this.postMiniKillErosion = true;
        } else {
          boss.miniBossWins = true;
          boss.killValue = 0;
          // Tint the boss more menacing
          boss.entity.sprite.tint = 0xFF6644;
        }
        this.enemies.push(boss);
        this.currentEventTimer = event.delay;
        break;
      }

      case 'flying_dragon':
        if (this.postMiniKillErosion && (event.moneyLoss ?? 0) > 0) {
          this.playWoundedFlinch();
          this.postMiniKillErosion = false;
        }
        this.spawnFlyingDragon(event.attackType ?? 'fireball', event.moneyLoss ?? 60);
        this.currentEventTimer = event.delay;
        break;

      case 'boss': {
        // Final boss — round-ender. Castle appears too for drama.
        this.castleTarget = 0.85;
        const bossEnemy = this.spawnBossEnemy(GAME_WIDTH + 80, 580);
        bossEnemy.isFinalBoss = true;
        if (event.outcome === 'lose') {
          bossEnemy.miniBossWins = true;
          bossEnemy.killValue = 0;
          bossEnemy.entity.sprite.tint = 0xFF4422;
        } else {
          bossEnemy.killValue = event.killValue!;
        }
        this.enemies.push(bossEnemy);

        this.spawnBanner('FINAL BOSS!', 0xFF2200, 52, 70);
        this.triggerShake(14, 22);
        this.callbacks.onFlashScreen('rgba(255, 200, 0, 0.2)');
        this.currentEventTimer = event.delay;
        break;
      }

      // Path B (real-RTP demo) — additions for the math-sdk's lightning + ambush variants.
      // The richer storm-cloud visual (autonomous in 'lightning') is intentionally
      // bypassed here so the score on screen matches the book's pre-rolled outcome.
      case 'lightning_penalty': {
        if (this.postMiniKillErosion) {
          this.playWoundedFlinch();
          this.postMiniKillErosion = false;
        }
        const loss = event.scoreLoss ?? 0;
        this.multiplier = Math.max(0, this.multiplier - loss);
        this.callbacks.onMultiplierChange(this.multiplier);
        this.spawnBanner('LIGHTNING!', 0x88AAFF, 44, 60);
        this.triggerShake(8, 18);
        this.callbacks.onFlashScreen('rgba(180, 200, 255, 0.4)');
        const heroX = this.heroEntity.container.x;
        const heroY = this.heroEntity.container.y;
        if (loss > 0) {
          this.spawnFloatingNumber(heroX, heroY - 130, `-$${loss.toFixed(0)}`, 0xFF4488);
        }
        this.currentEventTimer = event.delay;
        break;
      }

      case 'lightning_mode': {
        const gain = event.scoreGain ?? 0;
        this.awardScoreRamped(gain, event.delay);
        this.spawnBanner('LIGHTNING MODE', 0xEAEAFF, 44, 80);
        this.triggerShake(6, 14);
        this.callbacks.onFlashScreen('rgba(220, 230, 255, 0.45)');
        const heroX = this.heroEntity.container.x;
        const heroY = this.heroEntity.container.y;
        if (gain > 0) {
          this.spawnFloatingNumber(heroX, heroY - 130, `+$${gain.toFixed(0)}`, 0xEAEAFF);
        }
        this.currentEventTimer = event.delay;
        break;
      }

      case 'ambush_death': {
        // Banked-score model — early run-ender, score banked. Sprite-shatter
        // routed via killerId: combust = orange pop, banana = yellow upward
        // arc. Result overlay derives win/loss from accumulated multiplier.
        this.heroDied = true;
        this.eventQueue = [];
        this.pendingWave = null;

        // One treatment per contract flavour — a straight mapping, so the render
        // can never contradict the book. `dragon_snatch` is now a real killerId
        // carried by the math model rather than a renderer substitution on
        // `spontaneous_combustion`.
        const useSnatch = event.killerId === 'dragon_snatch';
        // Gated behind ?trace. Reviewers check the console for leaked game-state
        // information, and this fired ungated on ~40% of base rounds, naming the
        // killer and the round seed.
        if (TRACE_EVENTS) {
          console.log(
            `[death] ambush killerId=${event.killerId} seed=${this.roundSeed} ` +
              `→ ${useSnatch ? 'dragon_snatch' : event.killerId === 'banana_peel' ? 'banana' : 'combust'}`,
          );
        }

        if (useSnatch) {
          this.startDragonSnatch();
          // Telegraph + dive + hit-stop + ascent + aftermath hold.
          if (this.pendingLoseRound === 0) {
            this.pendingLoseRound = SlayTheBeastGame.SNATCH_TOTAL + 6;
          }
        } else {
          const flavour = event.killerId === 'banana_peel' ? 'banana' : 'combust';
          this.spawnSpriteShatter(this.heroEntity.container, { flavour });
          this.heroEntity.container.visible = false;
          this.spawnBanner('SLAIN!', 0xFF2222, 50, 70);
          this.triggerShake(16, 22);
          this.callbacks.onFlashScreen('rgba(255, 60, 60, 0.5)');
          if (this.pendingLoseRound === 0) {
            this.pendingLoseRound = MINI_BOSS_LOSE_BUFFER;
          }
        }
        this.currentEventTimer = event.delay;
        break;
      }
    }
  }

  destroy() {
    // Only tear down the Application if this scene created it. When embedded in
    // the submission app, pixi-svelte owns it.
    if (!this.ownsApp) {
      this.detach();
      return;
    }
    this.app.destroy(true);
  }
}

interface DemoEvent {
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
    | 'lightning'
    // Path B (real-book mode) — additions, not in the legacy demo round vocabulary.
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
  // Path B additions
  scoreLoss?: number;
  scoreGain?: number;
  killerId?: 'spontaneous_combustion' | 'banana_peel' | 'dragon_snatch';
}
