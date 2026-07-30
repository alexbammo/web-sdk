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
	import { Container } from 'pixi.js';
	import { innerWidth, innerHeight } from 'svelte/reactivity/window';
	import { getContextApp } from 'pixi-svelte';

	import { SlayTheBeastGame } from '../game/scene/scene';
	import { stateGame } from '../game/stateGame.svelte';

	const contextApp = getContextApp();

	/** The scene's design box. Matches GAME_WIDTH / GAME_HEIGHT in scene.ts. */
	const DESIGN_W = 540;
	const DESIGN_H = 960;

	let game: SlayTheBeastGame | undefined;
	let sceneRoot: Container | undefined;

	/**
	 * Reflow, not letterbox.
	 *
	 * The scene was attaching straight to app.stage at 1:1, so on anything other
	 * than a 540x960 viewport it rendered at fixed size in the corner. Wrapping it
	 * in the SDK's MainContainer would not have helped either — createMainLayout
	 * uses `Math.min(widthScale, heightScale)`, which is contain-fit, i.e. exactly
	 * the letterboxing CLAUDE.md forbids.
	 *
	 * Scale is therefore derived from HEIGHT alone. The scene is a horizontally
	 * scrolling strip with no intrinsic aspect ratio, so a wider viewport should
	 * show MORE WORLD at the same size rather than the same world stretched or
	 * shrunk. That is what makes one scene serve both the portrait phone sizes
	 * and the 16:9 landscape ones, including the 400x225 popout.
	 *
	 * Horizontal centring is a stopgap: the scene's own background layers are
	 * still authored to a 540-wide tile, so on a wide viewport there is world to
	 * the sides that is not yet painted. Making the world width dynamic is the
	 * remaining half of this work and it lives inside scene.ts, not here.
	 */
	$effect(() => {
		const w = innerWidth.current ?? DESIGN_W;
		const h = innerHeight.current ?? DESIGN_H;
		if (!sceneRoot) return;
		const scale = h / DESIGN_H;
		sceneRoot.scale.set(scale, scale);
		sceneRoot.x = (w - DESIGN_W * scale) / 2;
		sceneRoot.y = 0;
	});

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

			// Attach into our own root rather than app.stage directly, so the
			// reflow transform above has something to drive.
			const app = contextApp.stateApp.pixiApplication!;
			const root = new Container();
			app.stage.addChild(root);

			await instance.attach(app, root);
			if (cancelled) {
				instance.detach();
				root.parent?.removeChild(root);
				return;
			}
			sceneRoot = root;
			game = instance;
		})();

		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		game?.detach();
		sceneRoot?.parent?.removeChild(sceneRoot);
		sceneRoot = undefined;
		game = undefined;
	});
</script>
