<script lang="ts">
	import { onMount } from 'svelte';
	import { Viewer, type Framing } from './lib/viewer';
	import { loadImage, loadPersonMesh, toDataUrl } from './lib/avatar';
	import { analyze, finishPhoto, generateAvatar, getConfig, logout, me } from './lib/api';
	import { SCENE_LABELS, TIME_LABELS } from './lib/scenes';
	import {
		PROP_IDS,
		SCENE_IDS,
		TIMES_OF_DAY,
		type AvatarJob,
		type LinkedInIdentity,
		type PropId,
		type SceneDirection,
		type ServerConfig,
		type StillAspect,
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
	let fullBodyPhoto = $state(false);
	let heightCm = $state(172);

	let direction = $state<SceneDirection>({
		scene: 'office',
		timeOfDay: 'morning',
		accentColor: '#2f4a6b',
		warmth: 0.4,
		props: ['notebook', 'coffee'],
		outfit: '',
		caption: 'Add a photo, then recreate yourself in 3D',
		reasoning: '',
		source: 'heuristic',
	});

	let analyzing = $state(false);
	let generating = $state(false);
	let genProgress = $state(0);
	let genStage = $state<AvatarJob['stage']>('reference');
	let referenceUrl = $state<string | null>(null);
	let modelUrl = $state<string | null>(null);
	let yaw = $state(0);
	let framing = $state<Framing>('portrait');
	let stillAspect = $state<StillAspect>('1:1');
	let finishing = $state(false);
	let still = $state<{ url: string; photographic: boolean } | null>(null);
	let autoRotate = $state(false);
	let status = $state('');
	let error = $state('');
	let panelOpen = $state(true);

	const STAGE_LABELS: Record<AvatarJob['stage'], string> = {
		reference: 'Photographing you full-length…',
		views: 'Photographing side and back views…',
		mesh: 'Building your 3D model…',
	};

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
			modelUrl = referenceUrl = null;
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
		if (!photo) return;
		generating = true;
		genProgress = 0;
		referenceUrl = null;
		error = '';
		try {
			const job = await generateAvatar(
				{ photo, fullBodyPhoto, outfit: direction.outfit || undefined },
				(j) => {
					genProgress = j.progress;
					genStage = j.stage;
					if (j.referenceUrl) referenceUrl = j.referenceUrl;
					status = STAGE_LABELS[j.stage] + ` ${Math.round(j.progress * 100)}%`;
				},
			);
			status = 'Loading your 3D model…';
			const person = await loadPersonMesh(job.modelUrl!, heightCm / 100);
			viewer?.setAvatar(person, heightCm / 100);
			setFraming('portrait');
			modelUrl = job.modelUrl!;
			if (!direction.reasoning) direction.caption = '';
			yaw = 0;
			status = 'Your 3D model is in the scene';
		} catch (e) {
			error = `3D recreation failed: ${e instanceof Error ? e.message : e}`;
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

	function setFraming(f: Framing) {
		framing = f;
		viewer?.setFraming(f);
	}

	/**
	 * Renders the current view at LinkedIn size; with fal configured, the render
	 * then gets a photographic finishing pass that uses the original photo for identity.
	 */
	async function createStill() {
		if (!viewer) return;
		error = '';
		const render = viewer.renderStill(stillAspect);
		if (!config?.photoFinish || !photo || !modelUrl) {
			still = { url: render, photographic: false };
			return;
		}
		finishing = true;
		still = null;
		status = 'Finishing as a photograph…';
		try {
			const job = await finishPhoto({ render, photo, aspect: stillAspect });
			still = { url: job.imageUrl!, photographic: true };
			status = 'Your LinkedIn photo is ready';
		} catch (e) {
			error = `Photographic finish failed, showing the 3D render instead: ${e instanceof Error ? e.message : e}`;
			still = { url: render, photographic: false };
		} finally {
			finishing = false;
		}
	}

	const fileStem = () => (name || 'portrait').replace(/\s+/g, '-').toLowerCase();

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
		<h2><span>4</span> Recreate me in 3D</h2>
		{#if !config?.avatar.mesh}
			<p class="hint">
				Needs an image-to-3D service on the server: add <code>FAL_KEY</code> (does both steps) or
				<code>MESHY_API_KEY</code> to <code>.env</code>.
			</p>
		{:else}
			<p class="hint">
				{#if fullBodyPhoto}Your photo goes straight to 3D reconstruction.
				{:else}Your headshot is re-photographed full-length, in your own clothes, from the front,
					side and back, then rebuilt as a textured 3D model. Takes a few minutes.{/if}
			</p>
			<label>
				Outfit (taken from your photo)
				<input
					placeholder="e.g. navy wool blazer, white open-collar shirt, charcoal trousers, brown loafers"
					bind:value={direction.outfit}
				/>
			</label>
			<div class="grid2">
				<label>
					Height (cm)
					<input type="number" min="120" max="220" bind:value={heightCm} />
				</label>
				<label class="check">
					<input type="checkbox" bind:checked={fullBodyPhoto} />
					Photo is already full-length
				</label>
			</div>
			<button
				class="btn"
				onclick={runGenerate}
				disabled={!photo || generating || (!fullBodyPhoto && !config.avatar.fullBodyFromHeadshot)}
			>
				{#if generating}{STAGE_LABELS[genStage]} {Math.round(genProgress * 100)}%
				{:else}{modelUrl ? 'Recreate again' : 'Recreate me in 3D'}{/if}
			</button>
			{#if !fullBodyPhoto && !config.avatar.fullBodyFromHeadshot}
				<p class="hint">
					Turning a headshot into a full body needs <code>FAL_KEY</code>. Or upload a full-length
					photo.
				</p>
			{/if}
			{#if generating}<div class="bar"><div style="width:{genProgress * 100}%"></div></div>{/if}
			{#if referenceUrl}
				<figure class="reference">
					<img src={referenceUrl} alt="You, full-length, as the 3D model sees you" />
					<figcaption>Full-length photo the 3D model is built from</figcaption>
				</figure>
			{/if}
			{#if modelUrl}
				<label>
					Turn
					<input
						type="range"
						min="-180"
						max="180"
						step="1"
						bind:value={yaw}
						oninput={() => viewer?.setAvatarYaw(yaw)}
					/>
				</label>
				<a class="btn secondary" href={modelUrl} download="{fileStem()}.glb"
					>Download 3D model (.glb)</a
				>
			{/if}
		{/if}
	</section>

	{#if modelUrl}
		<section>
			<h2><span>5</span> LinkedIn photo</h2>
			<p class="hint">
				Frame the shot in the viewer, then create the image.
				{#if config?.photoFinish}The 3D render is finished as a real photograph, using your original
					photo so the face is yours.{/if}
			</p>
			<div class="segmented">
				<button class:on={stillAspect === '1:1'} onclick={() => (stillAspect = '1:1')}
					>Profile photo (1:1)</button
				>
				<button class:on={stillAspect === '16:9'} onclick={() => (stillAspect = '16:9')}
					>Post image (16:9)</button
				>
			</div>
			<button class="btn" onclick={createStill} disabled={finishing}>
				{finishing ? 'Finishing as a photograph…' : 'Create LinkedIn photo'}
			</button>
			{#if still}
				<figure class="reference">
					<img src={still.url} alt="Your LinkedIn portrait" />
					<figcaption>{still.photographic ? 'Photographic finish' : '3D render'}</figcaption>
				</figure>
				<a class="btn secondary" href={still.url} download="{fileStem()}-linkedin.jpg">Download</a>
			{/if}
		</section>
	{/if}

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
	{#if modelUrl}
		<button class:on={framing === 'portrait'} onclick={() => setFraming('portrait')}
			>Portrait</button
		>
		<button class:on={framing === 'scene'} onclick={() => setFraming('scene')}>Full scene</button>
	{/if}
</div>

{#if status}<div class="status">{status}</div>{/if}
