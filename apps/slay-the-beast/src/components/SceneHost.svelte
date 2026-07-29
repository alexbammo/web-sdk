<script lang="ts">
	/**
	 * Mounts the ported imperative scene into pixi-svelte's Application.
	 *
	 * The prototype's scene is a self-contained imperative PixiJS class; the
	 * submission app is declarative pixi-svelte. Rather than rewriting 4,300
	 * lines of tuned rendering into components — which is what produced the
	 * wireframe-quality slice that was rolled back in April — the scene attaches
	 * to the Application pixi-svelte already owns, so layout, reflow and asset
	 * loading stay with the SDK and every bit of the feel work ports unchanged.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { getContextApp } from 'pixi-svelte';

	import { SlayTheBeastGame } from '../game/scene/scene';
	import { stateGame } from '../game/stateGame.svelte';

	const contextApp = getContextApp();

	let game: SlayTheBeastGame | undefined;

	// Exposed so the book-event handlers can drive the scene imperatively.
	export function getScene() {
		return game;
	}

	onMount(() => {
		let cancelled = false;

		(async () => {
			// pixiApplication is populated by InitialiseApplication; it is undefined
			// on the first tick, so wait for it rather than racing it.
			while (!contextApp.stateApp.pixiApplication && !cancelled) {
				await new Promise((r) => requestAnimationFrame(r));
			}
			if (cancelled) return;

			const instance = new SlayTheBeastGame({
				onMultiplierChange: (v) => {
					stateGame.cumulativeScore = v;
				},
				onKillCountChange: () => {},
				onStateChange: (s) => {
					stateGame.isPlaying = s === 'playing';
				},
				onResultData: () => {},
				onFlashScreen: () => {},
			});

			await instance.attach(contextApp.stateApp.pixiApplication!);
			if (cancelled) {
				instance.detach();
				return;
			}
			game = instance;
		})();

		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		game?.detach();
		game = undefined;
	});
</script>
