<script lang="ts">
	import { App } from 'pixi-svelte';
	import { MainContainer } from 'components-layout';
	import { EnableHotkey } from 'components-shared';
	import { stateModal } from 'state-shared';
	import { UI } from 'components-ui-pixi';
	import { Modals } from 'components-ui-html';

	import { stateUi } from 'state-shared';

	import { getContext } from '../game/context';
	import SceneHost from './SceneHost.svelte';
	import EnableGameActor from './EnableGameActor.svelte';
	import ResumeBet from './ResumeBet.svelte';
	import ReplayGate from './ReplayGate.svelte';
	import GameInfo from './GameInfo.svelte';

	const context = getContext();

	let sceneHost = $state<SceneHost | undefined>();
	/** Rules / paytable / modes / legal. Must be reachable in-game at all times. */
	let showInfo = $state(false);

	/**
	 * Replay mode must make a transition into real play impossible — not merely
	 * hidden. Authenticate sets this when it sees `replay=true`.
	 */
	const isReplay = $derived(stateUi.config.mode === 'replay');

	context.eventEmitter.subscribeOnMount({
		// The SDK's bonus cards broadcast this; routing it to the confirm modal is
		// what satisfies the "modes over 2x base need a confirmation step" rule
		// for both ANTE and CHAOS.
		buyBonusConfirm: () => {
			stateModal.modal = { name: 'buyBonusConfirm' };
		},
	});
</script>

<App>
	<EnableGameActor />
	<!--
		Replay blocks every route into a real bet: no hotkeys (so spacebar cannot
		place one) and no ResumeBet auto-start — the ReplayGate drives playback
		explicitly instead, behind its Start Replay button.
	-->
	{#if !isReplay}
		<EnableHotkey />
		<ResumeBet />
	{/if}

	<MainContainer>
		<!-- The ported scene attaches to this Application's stage directly, so
		     pixi-svelte keeps ownership of layout, reflow and asset loading. -->
		<SceneHost bind:this={sceneHost} />
	</MainContainer>

	<!--
		The SDK bar: balance, bet selector, spin, turbo, autoplay, sound toggle,
		settings, paytable and rules. Every one of those is an approval
		requirement, and all of them arrive by mounting this rather than by
		hand-rolling a HUD.
	-->
	<UI />
</App>

<!-- Settings / bet menu / autoplay / buy-bonus / buy-bonus-confirm / error. -->
<Modals />

{#if isReplay}
	<ReplayGate />
{/if}

<!--
	Always-reachable info affordance. The disclaimer must sit behind an `i`
	button and a submission without one is not approved, so this is mounted
	outside the modal stack rather than depending on the SDK's menu being open.
-->
<button class="info-button" onclick={() => (showInfo = true)} aria-label="Game rules and information">
	i
</button>

{#if showInfo}
	<GameInfo onclose={() => (showInfo = false)} />
{/if}

<style>
	.info-button {
		position: fixed;
		top: 12px;
		right: 12px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1px solid #8b761c;
		background: rgba(20, 20, 0, 0.75);
		color: #e8cb52;
		font-family: ui-serif, Georgia, serif;
		font-size: 1rem;
		font-style: italic;
		cursor: pointer;
		z-index: 140;
	}
	.info-button:hover {
		background: #313000;
	}
</style>
