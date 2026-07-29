<script lang="ts">
	import { App } from 'pixi-svelte';
	import { MainContainer } from 'components-layout';

	import { getContext } from '../game/context';
	import { stateGame } from '../game/stateGame.svelte';
	import { pickBook } from '../game/bookSource';
	import { BET_MODES, type BetMode } from '../game/types';
	import { bookToDemoEvents } from '../game/bookEventAdapterPorted';
	import SceneHost from './SceneHost.svelte';

	const context = getContext();

	let sceneHost = $state<SceneHost | undefined>();
	let resultOverlay: { payoutMultiplier: number; result: 'win' | 'loss' } | null = $state(null);

	context.eventEmitter.subscribeOnMount({
		roundStart: () => {
			resultOverlay = null;
		},
		roundEndShow: async ({ payoutMultiplier, result }) => {
			resultOverlay = { payoutMultiplier, result };
		},
	});

	const MODE_LABEL: Record<BetMode, string> = {
		base: 'BASE — 1× cost',
		ante: 'ANTE — 5× cost',
		chaos: 'CHAOS — 100× cost',
	};

	/** Cost of each mode as a multiple of the base bet. */
	const MODE_COST: Record<BetMode, number> = { base: 1, ante: 5, chaos: 100 };

	/**
	 * Stake requires a confirmation step before activating any mode that costs
	 * more than 2x the base bet — their own example is that a 50x bonus mode
	 * cannot be entered with a single button press. That catches BOTH of our
	 * paid modes (ante 5x, chaos 100x), so a one-tap picker fails approval.
	 */
	const CONFIRM_ABOVE_COST = 2;
	const needsConfirm = (m: BetMode) => MODE_COST[m] > CONFIRM_ABOVE_COST;

	let activeMode = $state<BetMode>('base');
	/** Mode awaiting confirmation, or null. */
	let pendingMode = $state<BetMode | null>(null);

	const requestMode = (m: BetMode) => {
		if (stateGame.isPlaying) return;
		if (m === activeMode) return;
		if (needsConfirm(m)) pendingMode = m;
		else activeMode = m;
	};

	const confirmMode = () => {
		if (pendingMode) activeMode = pendingMode;
		pendingMode = null;
	};

	const cancelMode = () => {
		pendingMode = null;
	};

	/**
	 * Spacebar must be bound to the bet button (approval requirement). Ignored
	 * while a confirmation dialog is open, so it can never be used to skip the
	 * very gate it is meant to respect, and while focus is in a form control.
	 */
	const onKeydown = (e: KeyboardEvent) => {
		if (e.code !== 'Space') return;
		const el = e.target as HTMLElement | null;
		if (el && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) return;
		if (pendingMode) return;
		e.preventDefault();
		handleSpin();
	};

	const handleSpin = () => {
		if (stateGame.isPlaying) return;
		if (pendingMode) return;
		const scene = sceneHost?.getScene();
		if (!scene) return;

		resultOverlay = null;
		const book = pickBook(activeMode);
		// Same adapter the prototype uses. Kept as a straight port so the two
		// surfaces cannot drift while the prototype remains the iteration harness.
		const adapted = bookToDemoEvents(book as never);
		stateGame.mode = adapted.mode;
		stateGame.heroId = adapted.hero as never;
		stateGame.lastPayout = book.payoutMultiplier;
		scene.playRealBook(adapted.events, adapted.hero, adapted.mode, book.id, adapted.paceScale);
	};
</script>

<App>
	<MainContainer>
		<!-- The ported scene attaches to this Application's stage directly, so
		     pixi-svelte keeps ownership of layout, reflow and asset loading. -->
		<SceneHost bind:this={sceneHost} />
	</MainContainer>
</App>

<svelte:window onkeydown={onKeydown} />

<div class="hud">
	{#each BET_MODES as m (m)}
		<button
			class="mode"
			class:active={activeMode === m}
			disabled={stateGame.isPlaying}
			onclick={() => requestMode(m)}
		>
			{MODE_LABEL[m]}
		</button>
	{/each}
	<button class="spin" onclick={handleSpin} disabled={stateGame.isPlaying}>
		{stateGame.isPlaying ? 'PLAYING…' : 'SPIN'}
	</button>
	<span class="score">{stateGame.cumulativeScore.toFixed(1)}</span>
	{#if resultOverlay}
		<span class="payout">{resultOverlay.payoutMultiplier.toFixed(2)}×</span>
	{/if}
</div>

<!--
	Mandatory confirmation for any mode costing over 2x base. Visual treatment is
	placeholder — the behaviour is the approval requirement and does not change
	when the design system lands.
-->
{#if pendingMode}
	<div class="confirm-scrim" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
		<div class="confirm">
			<h2 id="confirm-title">Confirm {pendingMode.toUpperCase()}</h2>
			<p>
				This mode costs <strong>{MODE_COST[pendingMode]}×</strong> your base bet per round.
			</p>
			<div class="confirm-actions">
				<button onclick={cancelMode}>Cancel</button>
				<button class="spin" onclick={confirmMode}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.hud {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 12px 16px;
		background: rgba(20, 20, 30, 0.85);
		border: 1px solid rgba(255, 204, 68, 0.4);
		border-radius: 8px;
		font-family: ui-sans-serif, system-ui, sans-serif;
		color: #eee;
		z-index: 10;
	}
	select,
	button {
		padding: 8px 14px;
		font-size: 0.9rem;
		background: #222;
		color: #eee;
		border: 1px solid #444;
		border-radius: 6px;
	}
	button {
		background: #ffcc44;
		color: #111;
		font-weight: 800;
		cursor: pointer;
	}
	button:disabled,
	select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.mode.active {
		background: #ffcc44;
		color: #111;
		font-weight: 800;
	}
	.confirm-scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		display: grid;
		place-items: center;
		z-index: 20;
	}
	.confirm {
		background: #16161f;
		border: 1px solid rgba(255, 204, 68, 0.5);
		border-radius: 10px;
		padding: 20px 24px;
		max-width: 320px;
		text-align: center;
		font-family: ui-sans-serif, system-ui, sans-serif;
		color: #eee;
	}
	.confirm h2 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: #ffcc44;
	}
	.confirm p {
		margin: 0 0 16px;
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.confirm-actions {
		display: flex;
		gap: 10px;
		justify-content: center;
	}
	/* No "$" — the social-casino ruleset disallows currency prefixes in
	   player-visible text, and this readout is a display-scaled score rather
	   than a real currency amount in any case. */
	.score {
		font-weight: 800;
		color: #ffcc44;
	}
	.payout {
		color: #88ddff;
	}
</style>
