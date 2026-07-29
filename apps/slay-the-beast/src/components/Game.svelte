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

	let activeMode = $state<BetMode>('base');

	const handleSpin = () => {
		if (stateGame.isPlaying) return;
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

<div class="hud">
	<select bind:value={activeMode} disabled={stateGame.isPlaying}>
		{#each BET_MODES as m (m)}
			<option value={m}>{MODE_LABEL[m]}</option>
		{/each}
	</select>
	<button onclick={handleSpin} disabled={stateGame.isPlaying}>
		{stateGame.isPlaying ? 'PLAYING…' : 'SPIN'}
	</button>
	<span class="score">${stateGame.cumulativeScore.toFixed(1)}</span>
	{#if resultOverlay}
		<span class="payout">{resultOverlay.payoutMultiplier.toFixed(2)}×</span>
	{/if}
</div>

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
	.score {
		font-weight: 800;
		color: #ffcc44;
	}
	.payout {
		color: #88ddff;
	}
</style>
