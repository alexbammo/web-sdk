<script lang="ts">
	import { App } from 'pixi-svelte';
	import { MainContainer } from 'components-layout';
	import { EnableHotkey } from 'components-shared';
	import { stateModal } from 'state-shared';
	import { UI } from 'components-ui-pixi';
	import { Modals } from 'components-ui-html';

	import { getContext } from '../game/context';
	import SceneHost from './SceneHost.svelte';
	import EnableGameActor from './EnableGameActor.svelte';
	import ResumeBet from './ResumeBet.svelte';

	const context = getContext();

	let sceneHost = $state<SceneHost | undefined>();

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
	<EnableHotkey />
	<ResumeBet />

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
