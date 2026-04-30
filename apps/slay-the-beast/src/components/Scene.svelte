<script lang="ts">
	import { onMount } from 'svelte';
	import * as PIXI from 'pixi.js';
	import { BaseSprite, Container, Graphics, Rectangle, REM, Text } from 'pixi-svelte';

	import { SPRITE_PATHS } from '../game/assets';
	import {
		sceneState,
		tickScene,
		STAGE_W,
		STAGE_H,
		HERO_X,
		HERO_Y,
	} from '../game/scene/sceneController.svelte';
	import { heroIdleFrame, enemyIdleFrame } from '../game/scene/spriteFrames';

	// Local texture cache. Heroes / fodder / big enemies are 4×16 sprite-sheets;
	// we crop one idle frame per sheet on first use and memoise. Boss + dragon
	// PNGs use the full loaded texture.
	let loaded = $state(false);
	const fullTextures = new Map<string, PIXI.Texture>();
	const subTextureCache = new Map<string, PIXI.Texture>();

	function resolveTexture(key: string): PIXI.Texture | null {
		if (!loaded) return null;
		const cached = subTextureCache.get(key);
		if (cached) return cached;
		const full = fullTextures.get(key);
		if (!full) return null;
		let tex: PIXI.Texture;
		if (key.startsWith('hero/')) tex = heroIdleFrame(full);
		else if (key.startsWith('fodder/') || key.startsWith('big/')) tex = enemyIdleFrame(full);
		else tex = full;
		subTextureCache.set(key, tex);
		return tex;
	}

	onMount(() => {
		(async () => {
			const entries = Object.entries(SPRITE_PATHS);
			await Promise.all(
				entries.map(async ([key, src]) => {
					try {
						const tex = await PIXI.Assets.load<PIXI.Texture>(src);
						fullTextures.set(key, tex);
					} catch (err) {
						console.error(`Scene: failed to load ${key} from ${src}`, err);
					}
				}),
			);
			loaded = true;
		})();

		// rAF tick — drives actor movement, floater fade, flash decay.
		let rafId = 0;
		let lastTs = 0;
		const tick = (ts: number) => {
			const dt = lastTs === 0 ? 16 : ts - lastTs;
			lastTs = ts;
			tickScene(ts, dt);
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	const heroTexture = $derived(loaded ? resolveTexture(`hero/${sceneState.heroId}`) : null);
	const actorsWithTextures = $derived(
		sceneState.actors.map((a) => ({ actor: a, texture: resolveTexture(a.textureKey) })),
	);

	const BIOME_COLOR: Record<string, number> = {
		grasslands: 0x6cae5b,
		wasteland: 0x8a6a4a,
	};

	const drawHorizon = (g: PIXI.Graphics) => {
		g.rect(0, 0, STAGE_W, 540).fill(0x86c5e2);
		g.rect(0, 540, STAGE_W, 200).fill(0x4f7d3a);
		g.rect(0, 740, STAGE_W, 220).fill(0x2f5021);
	};

	const drawHeroGlow = (g: PIXI.Graphics) => {
		g.circle(0, -60, 90).fill({ color: 0x88ddff, alpha: 0.35 });
		g.circle(0, -60, 60).fill({ color: 0xddeeff, alpha: 0.45 });
	};
</script>

<Container>
	<!-- Backdrop -->
	<Graphics draw={drawHorizon} />
	<Rectangle
		x={0}
		y={0}
		width={STAGE_W}
		height={STAGE_H}
		color={BIOME_COLOR[sceneState.biomeId] ?? 0x6cae5b}
		alpha={0.15}
	/>

	<!-- Sky-dim overlay (lightning storm) -->
	{#if sceneState.skyDim > 0}
		<Rectangle
			x={0}
			y={0}
			width={STAGE_W}
			height={540}
			color={0x111133}
			alpha={sceneState.skyDim * 0.6}
		/>
	{/if}

	<!-- Actors (fodder, big enemies, dragon, boss) -->
	{#each actorsWithTextures as entry (entry.actor.id)}
		{#if entry.texture}
			<BaseSprite
				texture={entry.texture}
				x={entry.actor.x}
				y={entry.actor.y}
				anchor={{ x: 0.5, y: 1 }}
				scale={entry.actor.scale}
				alpha={entry.actor.alpha}
			/>
		{/if}
	{/each}

	<!-- Hero -->
	{#if sceneState.heroVisible && heroTexture && !sceneState.heroDead}
		{#if sceneState.heroGlow}
			<Container x={HERO_X} y={HERO_Y}>
				<Graphics draw={drawHeroGlow} />
			</Container>
		{/if}
		<BaseSprite
			texture={heroTexture}
			x={HERO_X}
			y={HERO_Y}
			anchor={{ x: 0.5, y: 1 }}
			scale={0.22 * sceneState.heroScale}
		/>
	{/if}

	<!-- Sprite-shatter death (combust) -->
	{#if sceneState.heroShatter > 0 && heroTexture}
		{#each Array(8) as _, i (i)}
			{@const angle = (i / 8) * Math.PI * 2}
			{@const r = 60 + i * 6}
			<BaseSprite
				texture={heroTexture}
				x={HERO_X + Math.cos(angle) * r}
				y={HERO_Y - 40 + Math.sin(angle) * r}
				anchor={{ x: 0.5, y: 0.5 }}
				scale={0.06}
				alpha={0.7}
				rotation={angle}
			/>
		{/each}
	{/if}

	<!-- Floaters -->
	{#each sceneState.floaters as f (f.id)}
		<Container x={f.x} y={f.y}>
			<Text
				anchor={{ x: 0.5, y: 0.5 }}
				text={f.text}
				alpha={f.alpha}
				style={{
					fontFamily: 'proxima-nova',
					fontSize: REM * 1.05,
					fontWeight: '800',
					fill: f.color,
					stroke: { color: 0x000000, width: 3 },
				}}
			/>
		</Container>
	{/each}

	<!-- Banners (centered top-third) -->
	{#each sceneState.banners as b (b.id)}
		<Container x={STAGE_W / 2} y={360}>
			<Rectangle x={-180} y={-32} width={360} height={64} color={0x111122} alpha={0.78} />
			<Text
				anchor={{ x: 0.5, y: 0.5 }}
				text={b.text}
				style={{
					fontFamily: 'proxima-nova',
					fontSize: REM * 2,
					fontWeight: '900',
					fill: b.color,
					stroke: { color: 0x000000, width: 4 },
				}}
			/>
		</Container>
	{/each}

	<!-- Flash overlay -->
	{#if sceneState.flash}
		<Rectangle
			x={0}
			y={0}
			width={STAGE_W}
			height={STAGE_H}
			color={sceneState.flash.color}
			alpha={sceneState.flash.alpha}
		/>
	{/if}
</Container>
