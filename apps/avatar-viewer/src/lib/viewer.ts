import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildScene, type BuiltScene } from './scenes';
import { LIGHTING, kelvin, practicalColor } from './lighting';
import { loadHdri } from './polyhaven';
import type { AvatarHandle } from './avatar';
import type { SceneDirection, StillAspect } from './types';
import { STILL_ASPECTS } from './types';

export type Framing = 'portrait' | 'scene';

/** Portrait lens: ~85mm on full frame. Scene lens: ~50mm. */
const PORTRAIT_FOV = 20;
const SCENE_FOV = 38;
const PERSON_HEIGHT_FALLBACK = 1.72;

export class Viewer {
	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera: THREE.PerspectiveCamera;
	private controls: OrbitControls;
	private composer: EffectComposer;
	private bloom: UnrealBloomPass;
	private sun = new THREE.DirectionalLight(0xffffff, 3);
	private fill = new THREE.HemisphereLight(0xdde6ff, 0x3a2e24, 0.15);
	private built: BuiltScene | null = null;
	private avatar: AvatarHandle | null = null;
	private avatarRig = new THREE.Group();
	private skybox: GroundedSkybox | null = null;
	private hdri: THREE.Texture | null = null;
	private fallbackEnv: THREE.Texture;
	private direction: SceneDirection | null = null;
	private buildToken = 0;
	private timer = new THREE.Timer();
	private resizeObserver: ResizeObserver;
	private yaw = 0;
	private framing: Framing = 'portrait';
	private personHeight = PERSON_HEIGHT_FALLBACK;
	private bokeh: BokehPass;
	/** Softbox key, fill and rim that travel with the person. */
	private portraitLights: THREE.RectAreaLight[] = [];

	onStatus: (msg: string) => void = () => {};

	constructor(private container: HTMLElement) {
		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			preserveDrawingBuffer: true,
			powerPreference: 'high-performance',
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		// Variance shadow maps give genuinely soft, diffused shadow edges.
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		container.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.06;
		this.controls.minDistance = 0.7;
		this.controls.maxDistance = 6.5;
		this.controls.maxPolarAngle = Math.PI * 0.53;
		this.controls.autoRotateSpeed = 0.6;

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.fallbackEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		pmrem.dispose();

		this.sun.castShadow = true;
		// VSM blurs the map, so 2048² is as crisp as 4096² at a quarter of the cost.
		this.sun.shadow.mapSize.set(2048, 2048);
		const s = this.sun.shadow.camera;
		s.left = s.bottom = -6;
		s.right = s.top = 6;
		s.near = 0.5;
		s.far = 40;
		this.sun.shadow.bias = -0.0004;
		this.sun.shadow.normalBias = 0.02;
		this.sun.shadow.radius = 14;
		this.sun.shadow.blurSamples = 16;
		this.scene.add(this.sun, this.sun.target, this.fill, this.avatarRig);
		this.addPortraitLights();

		const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
		this.composer = new EffectComposer(this.renderer, rt);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		// Shallow depth of field in portrait framing: sharp face, softly blurred set.
		this.bokeh = new BokehPass(this.scene, this.camera, {
			focus: 2.6,
			// Blur ≈ aperture × metres from the focal plane (the shader scales offsets by ~0.4).
			aperture: 0.008,
			maxblur: 0.03,
		});
		this.composer.addPass(this.bokeh);
		this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.4, 1.6);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(container);
		this.resize();
		this.renderer.setAnimationLoop(() => this.tick());
	}

	private resize() {
		const w = this.container.clientWidth || 1;
		const h = this.container.clientHeight || 1;
		this.renderer.setSize(w, h, false);
		this.composer.setSize(w, h);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	private tick() {
		this.timer.update();
		const t = this.timer.getElapsed();
		this.controls.update();
		// Gentle flicker on practicals after dark – barely perceptible, but it sells the scene.
		if (
			this.built &&
			this.direction &&
			(this.direction.timeOfDay === 'night' || this.direction.timeOfDay === 'dusk')
		) {
			const k = LIGHTING[this.direction.timeOfDay].practicalIntensity;
			this.built.practicals.forEach((p, i) => {
				p.light.intensity =
					p.base * k * (1 + Math.sin(t * 7.3 + i * 1.7) * 0.015 + Math.sin(t * 13.1 + i) * 0.01);
			});
		}
		this.updateFocus();
		this.composer.render();
	}

	private addPortraitLights() {
		RectAreaLightUniformsLib.init();
		// Positions are relative to the person (who faces +Z), in metres.
		const rig: [x: number, y: number, z: number, w: number, h: number, intensity: number][] = [
			[-1.1, 2.0, 1.3, 1.0, 1.3, 7], // key: large softbox, front-left, above eye line
			[1.3, 1.4, 1.5, 1.2, 1.2, 2.2], // fill: front-right, lower and weaker
			[0.4, 2.1, -1.2, 0.5, 1.2, 4], // rim: behind, separates hair and shoulders from the set
		];
		for (const [x, y, z, w, h, intensity] of rig) {
			const l = new THREE.RectAreaLight(0xffffff, intensity, w, h);
			l.position.set(x, y, z);
			l.lookAt(0, 1.45, 0);
			l.userData.base = intensity;
			this.avatarRig.add(l);
			this.portraitLights.push(l);
		}
	}

	private updateFocus() {
		const uniforms = (this.bokeh as unknown as { uniforms: Record<string, THREE.IUniform> })
			.uniforms;
		this.bokeh.enabled = this.framing === 'portrait' && Boolean(this.avatar);
		if (!this.bokeh.enabled) return;
		const face = new THREE.Vector3(0, this.personHeight * 0.92, 0).applyMatrix4(
			this.avatarRig.matrixWorld,
		);
		uniforms.focus.value = this.camera.position.distanceTo(face);
		uniforms.aspect.value = this.camera.aspect; // BokehPass only reads it once, at construction
	}

	async setDirection(dir: SceneDirection) {
		const token = ++this.buildToken;
		const sameScene =
			this.direction &&
			this.direction.scene === dir.scene &&
			this.direction.accentColor === dir.accentColor &&
			this.direction.props.join() === dir.props.join();
		this.direction = dir;

		if (!sameScene) {
			if (this.built) {
				this.scene.remove(this.built.root);
				this.built.root.traverse((o) => {
					const m = o as THREE.Mesh;
					if (m.isMesh) m.geometry.dispose();
				});
			}
			this.built = buildScene(dir);
			this.scene.add(this.built.root);
			this.placeAvatar();
		}
		this.applyLighting(dir);

		this.onStatus('Loading Poly Haven sky…');
		const tex = await loadHdri(this.built!.hdri, '2k');
		if (token !== this.buildToken) {
			tex?.dispose();
			return;
		}
		this.setEnvironment(tex);
		this.onStatus(
			tex
				? `Lighting: ${tex.name} (Poly Haven, CC0)`
				: 'Poly Haven unreachable – using studio lighting',
		);
	}

	private setEnvironment(tex: THREE.Texture | null) {
		if (this.hdri && this.hdri !== tex) this.hdri.dispose();
		this.hdri = tex;
		if (this.skybox) {
			this.scene.remove(this.skybox);
			this.skybox.geometry.dispose();
			this.skybox = null;
		}
		if (!tex) {
			// Offline / Poly Haven unreachable: neutral studio reflections and a sky-ish backdrop.
			this.scene.environment = this.fallbackEnv;
			this.scene.background = new THREE.Color(
				this.direction ? LIGHTING[this.direction.timeOfDay].fog : 0x202225,
			);
			return;
		}
		this.scene.environment = tex;
		if (this.built?.outdoor) {
			// Project the HDRI onto a ground dome so the horizon sits correctly behind the terrace.
			this.skybox = new GroundedSkybox(tex, 12, 120);
			this.skybox.position.y = 12 - 0.01;
			this.scene.add(this.skybox);
			this.scene.background = null;
		} else {
			this.scene.background = tex;
			this.scene.backgroundBlurriness = 0.02;
		}
	}

	private applyLighting(dir: SceneDirection) {
		const L = LIGHTING[dir.timeOfDay];
		const built = this.built!;
		const az = THREE.MathUtils.degToRad(built.sunAzimuth ?? L.sunAzimuth);
		const el = THREE.MathUtils.degToRad(Math.max(L.sunElevation, 2));
		const dist = 20;
		// azimuth: 0° = from the camera side (+Z), 90° = from +X, 270° = from -X
		this.sun.position.set(
			Math.sin(az) * Math.cos(el) * dist,
			Math.sin(el) * dist,
			Math.cos(az) * Math.cos(el) * dist,
		);
		this.sun.target.position.set(0, 0.8, 0);
		this.sun.color.copy(kelvin(L.sunKelvin));
		// warmth nudges the sun too, so the whole frame agrees
		this.sun.color.lerp(kelvin(2600), dir.warmth * 0.2);
		this.sun.intensity = L.sunIntensity;
		this.scene.environmentIntensity = L.envIntensity * built.envScale;
		this.scene.backgroundIntensity = built.outdoor ? 1 : 0.8;
		this.renderer.toneMappingExposure = L.exposure;
		this.bloom.strength = L.bloom;
		this.fill.intensity = built.outdoor ? 0.1 : 0.2;
		this.scene.fog = built.outdoor ? new THREE.FogExp2(L.fog, L.fogDensity * 0.6) : null;

		// Softboxes: daylight-balanced, nudged by warmth; kept even so skin stays natural.
		const key = kelvin(THREE.MathUtils.lerp(5600, 4300, dir.warmth));
		for (const l of this.portraitLights) {
			l.color.copy(key);
			l.intensity = (l.userData.base as number) * L.portraitIntensity;
		}

		const pc = practicalColor(dir.warmth);
		for (const p of built.practicals) {
			p.light.color.copy(pc);
			p.light.intensity = p.base * L.practicalIntensity;
			if (p.bulb) {
				const m = p.bulb.material as THREE.MeshStandardMaterial;
				m.color.copy(pc);
				m.emissive.copy(pc);
				m.emissiveIntensity = 1 + L.practicalIntensity * 3;
			}
		}
		this.built?.root.traverse((o) => {
			const mat = o.userData.bulbMaterial as THREE.MeshStandardMaterial | undefined;
			if (mat) {
				mat.color.copy(pc);
				mat.emissive.copy(pc);
				mat.emissiveIntensity = 1 + L.practicalIntensity * 3;
			}
		});
	}

	setAvatar(handle: AvatarHandle | null, heightM = PERSON_HEIGHT_FALLBACK) {
		if (this.avatar) {
			this.avatarRig.remove(this.avatar.object);
			this.avatar.dispose();
		}
		this.avatar = handle;
		this.personHeight = heightM;
		if (handle) this.avatarRig.add(handle.object);
		for (const l of this.portraitLights) l.visible = Boolean(handle);
		this.placeAvatar();
	}

	/** Extra rotation (degrees) on top of facing the camera – generated meshes don't always face forward. */
	setAvatarYaw(deg: number) {
		this.yaw = THREE.MathUtils.degToRad(deg);
		this.placeAvatar(false);
	}

	setFraming(framing: Framing) {
		this.framing = framing;
		this.placeAvatar();
	}

	/** Stands the person beside the table, turned towards the opening camera, and frames the shot. */
	private placeAvatar(frameCamera = true) {
		if (!this.built) return;
		const spot = this.built.standAt;
		const start = this.built.cameraStart;
		this.avatarRig.position.copy(spot);
		const facing = Math.atan2(start.x - spot.x, start.z - spot.z) * 0.7;
		this.avatarRig.rotation.y = facing + this.yaw;
		this.avatarRig.updateMatrixWorld();
		if (!frameCamera) return;

		if (this.framing === 'portrait' && this.avatar) {
			// Waist-up portrait on a long lens, camera just above eye level, slightly off-axis.
			const h = this.personHeight;
			this.camera.fov = PORTRAIT_FOV;
			const target = new THREE.Vector3(spot.x, h * 0.8, spot.z);
			const angle = facing + 0.3;
			const visible = h * 0.62; // mid-thigh to just above the head
			const dist = visible / (2 * Math.tan(THREE.MathUtils.degToRad(PORTRAIT_FOV / 2)));
			this.camera.position.set(
				spot.x + Math.sin(angle) * dist,
				h * 0.9,
				spot.z + Math.cos(angle) * dist,
			);
			this.controls.target.copy(target);
		} else {
			// Frame the table and the whole person, from the scene's preferred direction.
			this.camera.fov = SCENE_FOV;
			const target = new THREE.Vector3(spot.x * 0.55, 0.9, spot.z * 0.5);
			const dir = start.clone().sub(target).setY(0).normalize();
			this.camera.position
				.copy(target)
				.addScaledVector(dir, this.built.frameDistance ?? 3.9)
				.setY(1.5);
			this.controls.target.copy(target);
		}
		this.camera.updateProjectionMatrix();
		this.controls.update();
	}

	setAutoRotate(on: boolean) {
		this.controls.autoRotate = on;
	}

	/**
	 * Renders the current view as a high-resolution still at a LinkedIn-friendly
	 * aspect (1:1 profile photo or 16:9 post), independent of the window size.
	 */
	renderStill(aspect: StillAspect, longEdge = 1536): string {
		const [aw, ah] = STILL_ASPECTS[aspect];
		const w = aw >= ah ? longEdge : Math.round((longEdge * aw) / ah);
		const h = aw >= ah ? Math.round((longEdge * ah) / aw) : longEdge;
		const prevRatio = this.renderer.getPixelRatio();
		const prevAspect = this.camera.aspect;
		this.renderer.setPixelRatio(1);
		this.renderer.setSize(w, h, false);
		this.composer.setPixelRatio(1);
		this.composer.setSize(w, h);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.updateFocus();
		this.composer.render();
		const url = this.renderer.domElement.toDataURL('image/jpeg', 0.92);
		this.renderer.setPixelRatio(prevRatio);
		this.composer.setPixelRatio(prevRatio);
		this.camera.aspect = prevAspect;
		this.resize();
		return url;
	}

	dispose() {
		this.renderer.setAnimationLoop(null);
		this.resizeObserver.disconnect();
		this.controls.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}
