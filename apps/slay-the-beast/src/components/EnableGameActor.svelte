<script lang="ts">
	/**
	 * Bridges the bet actor to the app's event emitter.
	 *
	 * Nothing calls the actor directly — every path into it goes through a
	 * broadcast, so the UI, hotkeys and autoplay all share one entry point and
	 * none of them can start a round the state machine is not expecting.
	 */
	import { onMount } from 'svelte';

	import { gameActor } from '../game/actor';
	import { getContext } from '../game/context';

	const context = getContext();

	onMount(() => {
		const { unsubscribe } = gameActor.subscribe((snapshot) => {
			context.stateXstate.value = snapshot.value;
		});

		gameActor.start();
		gameActor.send({ type: 'RENDERED' });

		return () => {
			unsubscribe();
			gameActor.stop();
		};
	});

	context.eventEmitter.subscribeOnMount({
		bet: () => gameActor.send({ type: 'BET' }),
		autoBet: () => gameActor.send({ type: 'AUTO_BET' }),
		resumeBet: () => gameActor.send({ type: 'RESUME_BET' }),
	});
</script>
