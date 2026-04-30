<script lang="ts">
	import { onMount } from 'svelte';
	import { App, Text, Container, Rectangle, REM } from 'pixi-svelte';
	import { MainContainer } from 'components-layout';

	import { getContext } from '../game/context';
	import { stateGame } from '../game/stateGame.svelte';
	import { playBook } from '../game/utils';
	import { pickBook } from '../game/bookSource';
	import { BET_MODES, type BetMode } from '../game/types';
	import Scene from './Scene.svelte';

	const context = getContext();

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

	const handleSpin = async () => {
		if (stateGame.isPlaying) return;
		const book = pickBook(activeMode);
		await playBook(book);
	};

	onMount(() => {
		// Greet the dispatcher once on mount so context is fully wired before the
		// first SPIN. Cheap. Intentionally not loading any books here.
	});
</script>

<App>
	<MainContainer>
		<!-- Gameplay scene (background + hero + actors + floaters + flash overlay).
		     Renders behind the HUD; AssetsLoader gates this until sprites preload. -->
		<Scene />

		<!-- HUD: title strip at top, big score readout, status under it. -->
		<Container x={270} y={32}>
			<Text
				anchor={{ x: 0.5, y: 0 }}
				text="SLAY THE BEAST"
				style={{
					fontFamily: 'proxima-nova',
					fontSize: REM * 1.5,
					fontWeight: '800',
					fill: 0xffcc44,
					stroke: { color: 0x000000, width: 4 },
				}}
			/>
		</Container>

		<Container x={270} y={72}>
			<Text
				anchor={{ x: 0.5, y: 0 }}
				text={`${stateGame.mode.toUpperCase()}  ·  ${stateGame.heroId}  ·  ${stateGame.biomeId}`}
				style={{
					fontFamily: 'proxima-nova',
					fontSize: REM * 0.7,
					fill: 0xddeeff,
					stroke: { color: 0x000000, width: 3 },
				}}
			/>
		</Container>

		<Container x={270} y={130}>
			<Text
				anchor={{ x: 0.5, y: 0.5 }}
				text={`$${stateGame.cumulativeScore.toFixed(2)}`}
				style={{
					fontFamily: 'proxima-nova',
					fontSize: REM * 2.6,
					fontWeight: '800',
					fill: stateGame.isPlaying ? 0xffffff : 0x88aabb,
					stroke: { color: 0x000000, width: 4 },
				}}
			/>
		</Container>

		<Container x={270} y={172}>
			<Text
				anchor={{ x: 0.5, y: 0 }}
				text={stateGame.isPlaying ? 'PLAYING…' : 'IDLE'}
				style={{
					fontFamily: 'proxima-nova',
					fontSize: REM * 0.7,
					fill: stateGame.isPlaying ? 0xffaa44 : 0x556677,
					stroke: { color: 0x000000, width: 3 },
				}}
			/>
		</Container>

		{#if resultOverlay}
			<Rectangle
				width={540}
				height={960}
				anchor={{ x: 0, y: 0 }}
				color={resultOverlay.result === 'win' ? 0x114422 : 0x441122}
				alpha={0.85}
			/>
			<Container x={270} y={420}>
				<Text
					anchor={{ x: 0.5, y: 0.5 }}
					text={resultOverlay.result === 'win' ? 'VICTORY' : 'SLAIN'}
					style={{
						fontFamily: 'proxima-nova',
						fontSize: REM * 3.5,
						fontWeight: '900',
						fill: resultOverlay.result === 'win' ? 0xffcc44 : 0xff5566,
					}}
				/>
			</Container>
			<Container x={270} y={520}>
				<Text
					anchor={{ x: 0.5, y: 0.5 }}
					text={`PAYOUT: ${resultOverlay.payoutMultiplier.toFixed(2)}×`}
					style={{
						fontFamily: 'proxima-nova',
						fontSize: REM * 1.5,
						fill: 0xffffff,
					}}
				/>
			</Container>
		{/if}
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
</style>
