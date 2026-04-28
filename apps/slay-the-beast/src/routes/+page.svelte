<script lang="ts">
	import { setContext } from '../game/context';
	import Game from '../components/Game.svelte';

	// Wire the shared contexts (eventEmitter, layout, xstate, app) BEFORE mounting
	// the App component tree so child components can read them via getContext().
	setContext();
</script>

<Game />

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #0a0a14;
		overflow: hidden;
	}
</style>
