<script lang="ts">
	/**
	 * Restores a round interrupted by a refresh.
	 *
	 * Required by approval: the selected bet must survive a mid-spin reload, and
	 * a round already paid for must not be silently lost.
	 */
	import { onMount } from 'svelte';
	import { stateBet } from 'state-shared';

	import { getContext } from '../game/context';

	const context = getContext();

	onMount(() => {
		if (stateBet.betToResume?.active && stateBet.betToResume.mode) {
			stateBet.activeBetModeKey = stateBet.betToResume.mode;
		}
		context.eventEmitter.broadcast({ type: 'resumeBet' });
	});
</script>
