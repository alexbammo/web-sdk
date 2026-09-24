<script lang="ts">
	import { onMount } from 'svelte';
	import { Viewer } from './lib/viewer';
	import {
		buildReliefAvatar,
		loadImage,
		loadMeshAvatar,
		sampleClothing,
		toDataUrl,
	} from './lib/avatar';
	import { analyze, generateAvatar, getConfig, logout, me } from './lib/api';
	import { SCENE_LABELS, TIME_LABELS } from './lib/scenes';
	import {
		PROP_IDS,
		SCENE_IDS,
		TIMES_OF_DAY,
		type LinkedInIdentity,
		type PropId,
		type SceneDirection,
		type ServerConfig,
	} from './lib/types';

	let canvasHost: HTMLDivElement;
	let viewer: Viewer | null = null;

	let config = $state<ServerConfig | null>(null);
	let identity = $state<LinkedInIdentity | null>(null);

	let name = $state('');
	let headline = $state('');
	let about = $state('');
	let extra = $state('');
	let photo = $state<string | null>(null);
	let photoImg: HTMLImageElement | null = null;

	let direction = $state<SceneDirection>({
		scene: 'cafe',
		timeOfDay: 'morning',
		accentColor: '#3f6e8c',
		warmth: 0.55,
		props: ['coffee', 'laptop', 'plants'],
		caption: 'Add a photo to take a seat',
		reasoning: '',
		source: 'heuristic',
	});

	let analyzing = $state(false);
	let avatarKind = $state<'none' | 'relief' | 'mesh'>('none');
	let generating = $state(false);
	let genProgress = $state(0);
	let yaw = $state(0);
	let autoRotate = $state(false);
	let status = $state('');
	let error = $state('');
	let panelOpen = $state(true);

	const PROP_LABELS: Record<PropId, string> = {
		coffee: 'Coffee',
		tea: 'Tea',
		wine: 'Wine',
		laptop: 'Laptop',
		books: 'Books',
		plants: 'Plant',
		flowers: 'Flowers',
		sketchbook: 'Sketchbook',
		camera: 'Camera',
		headphones: 'Headphones',
		notebook: 'Notebook',
	};

	onMount(() => {
		viewer = new Viewer(canvasHost);
		viewer.onStatus = (s) => (status = s);
		viewer.setDirection($state.snapshot(direction));

		(async () => {
			config = await getConfig();
			const params = new URLSearchParams(location.search);
			if (params.has('linkedin')) {
				if (params.get('linkedin') === 'denied') error = 'LinkedIn sign-in was cancelled.';
				history.replaceState(null, '', location.pathname);
			}
			if (config?.linkedin) {
				identity = await me();
				if (identity) {
					name = identity.name;
					if (identity.picture) await usePhoto('/api/me/photo');
				}
			}
		})();

		return () => viewer?.dispose();
	});

	function redraw() {
		viewer?.setDirection($state.snapshot(direction));
	}

	async function usePhoto(src: string) {
		error = '';
		try {
			const img = await loadImage(src);
			photo = toDataUrl(img);
			photoImg = await loadImage(photo);
			status = 'Cutting out your portrait…';
			const relief = await buildReliefAvatar(photoImg);
			viewer?.setAvatar(relief);
			avatarKind = 'relief';
			if (!direction.reasoning) direction.caption = 'Take a seat – then tell us a little about you';
			status = 'Instant 2.5D preview ready';
		} catch (e) {
			error = `Couldn't use that photo: ${e instanceof Error ? e.message : e}`;
		}
	}

	function onFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) usePhoto(URL.createObjectURL(file));
	}

	async function runAnalysis() {
		analyzing = true;
		error = '';
		try {
			direction = await analyze(
				{ name, headline, about, extra, photo: photo ?? undefined },
				Boolean(config),
			);
			redraw();
		} catch (e) {
			error = `Analysis failed: ${e instanceof Error ? e.message : e}`;
		} finally {
			analyzing = false;
		}
	}

	async function runGenerate() {
		if (!photo || !photoImg) return;
		generating = true;
		genProgress = 0;
		error = '';
		try {
			const job = await generateAvatar(photo, (j) => {
				genProgress = j.progress;
				status =
					j.status === 'queued'
						? `Queued with ${j.provider}…`
						: `Sculpting 3D model with ${j.provider}… ${Math.round(j.progress * 100)}%`;
			});
			status = 'Loading 3D model…';
			const mesh = await loadMeshAvatar(job.modelUrl!, sampleClothing(photoImg));
			viewer?.setAvatar(mesh);
			viewer?.setAvatarYaw(yaw);
			avatarKind = 'mesh';
			status = 'High-quality 3D avatar loaded';
		} catch (e) {
			error = `3D generation failed: ${e instanceof Error ? e.message : e}`;
		} finally {
			generating = false;
		}
	}

	function toggleProp(p: PropId) {
		direction.props = direction.props.includes(p)
			? direction.props.filter((x) => x !== p)
			: [...direction.props, p].slice(-4);
		redraw();
	}

	function saveShot() {
		const url = viewer?.screenshot();
		if (!url) return;
		const a = document.createElement('a');
		a.href = url;
		a.download = `${(name || 'portrait').replace(/\s+/g, '-').toLowerCase()}-${direction.scene}.png`;
		a.click();
	}

	async function signOut() {
		await logout();
		identity = null;
	}
</script>

<div class="stage" bind:this={canvasHost}></div>

<button class="panel-toggle" onclick={() => (panelOpen = !panelOpen)} aria-label="Toggle panel">
	{panelOpen ? '‹' : '›'}
</button>

<aside class="panel" class:closed={!panelOpen}>
	<header>
		<h1>Profile Scene</h1>
		<p class="sub">Your profile photo, as a 3D portrait in a place that fits you.</p>
	</header>

	<section>
		<h2><span>1</span> You</h2>
		{#if identity}
			<div class="identity">
				<span>Signed in as <strong>{identity.name}</strong></span>
				<button class="link" onclick={signOut}>Sign out</button>
			</div>
		{:else if config?.linkedin}
			<a class="btn linkedin" href="/api/auth/linkedin">Continue with LinkedIn</a>
			<p class="hint">
				Imports your name and profile photo. LinkedIn doesn't share headline, about or posts with
				apps – paste those below.
			</p>
		{/if}
		<div class="photo-row">
			{#if photo}
				<img class="thumb" src={photo} alt="Profile" />
			{:else}
				<div class="thumb empty">No photo</div>
			{/if}
			<label class="btn secondary">
				{photo ? 'Change photo' : 'Upload photo'}
				<input type="file" accept="image/*" onchange={onFile} hidden />
			</label>
		</div>
		<input placeholder="Name" bind:value={name} />
	</section>

	<section>
		<h2><span>2</span> About you</h2>
		<input placeholder="Headline – e.g. Product designer at Monzo" bind:value={headline} />
		<textarea rows="3" placeholder="About section" bind:value={about}></textarea>
		<textarea rows="2" placeholder="Recent posts, skills, interests (optional)" bind:value={extra}
		></textarea>
		<button class="btn" onclick={runAnalysis} disabled={analyzing}>
			{analyzing
				? 'Reading your profile…'
				: config?.claude
					? 'Direct my scene with Claude'
					: 'Suggest a scene'}
		</button>
		{#if direction.reasoning}
			<p class="reasoning">
				<em>{direction.source === 'claude' ? 'Claude' : 'Heuristic'}:</em>
				{direction.reasoning}
			</p>
		{/if}
	</section>

	<section>
		<h2><span>3</span> Scene</h2>
		<div class="grid2">
			<label>
				Setting
				<select bind:value={direction.scene} onchange={redraw}>
					{#each SCENE_IDS as s}<option value={s}>{SCENE_LABELS[s]}</option>{/each}
				</select>
			</label>
			<label>
				Light
				<select bind:value={direction.timeOfDay} onchange={redraw}>
					{#each TIMES_OF_DAY as t}<option value={t}>{TIME_LABELS[t]}</option>{/each}
				</select>
			</label>
			<label>
				Accent
				<input type="color" bind:value={direction.accentColor} onchange={redraw} />
			</label>
			<label>
				Warmth
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					bind:value={direction.warmth}
					onchange={redraw}
				/>
			</label>
		</div>
		<div class="chips">
			{#each PROP_IDS as p}
				<button class="chip" class:on={direction.props.includes(p)} onclick={() => toggleProp(p)}
					>{PROP_LABELS[p]}</button
				>
			{/each}
		</div>
	</section>

	<section>
		<h2><span>4</span> 3D avatar</h2>
		<p class="hint">
			{#if avatarKind === 'none'}Add a photo to see yourself in the scene.
			{:else if avatarKind === 'relief'}Showing the instant 2.5D preview (best from the front).
			{:else}Showing the full 3D model.{/if}
		</p>
		{#if config?.avatarProvider}
			<button class="btn" onclick={runGenerate} disabled={!photo || generating}>
				{generating ? `Sculpting… ${Math.round(genProgress * 100)}%` : 'Generate high-quality 3D'}
			</button>
			{#if generating}<div class="bar"><div style="width:{genProgress * 100}%"></div></div>{/if}
		{:else}
			<p class="hint">
				Add a <code>MESHY_API_KEY</code> or <code>FAL_KEY</code> to the server for a full textured 3D
				mesh.
			</p>
		{/if}
		{#if avatarKind === 'mesh'}
			<label>
				Turn avatar
				<input
					type="range"
					min="-180"
					max="180"
					step="1"
					bind:value={yaw}
					oninput={() => viewer?.setAvatarYaw(yaw)}
				/>
			</label>
		{/if}
	</section>

	{#if error}<p class="error">{error}</p>{/if}
</aside>

<div class="caption">
	<p>{direction.caption}</p>
	{#if name}<span
			>{name} · {SCENE_LABELS[direction.scene]} · {TIME_LABELS[direction.timeOfDay]}</span
		>{/if}
</div>

<div class="tools">
	<button class:on={autoRotate} onclick={() => viewer?.setAutoRotate((autoRotate = !autoRotate))}
		>Orbit</button
	>
	<button onclick={saveShot}>Save still</button>
</div>

{#if status}<div class="status">{status}</div>{/if}
