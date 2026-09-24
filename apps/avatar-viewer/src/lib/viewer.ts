import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildScene, SITTER_Z, type BuiltScene } from './scenes';
import { LIGHTING, kelvin, practicalColor } from './lighting';
import { loadHdri } from './polyhaven';
import type { AvatarHandle } from './avatar';
import type { SceneDirection } from './types';

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
	private torso: THREE.Mesh;
	private skybox: GroundedSkybox | null = null;
	private hdri: THREE.Texture | null = null;
	private fallbackEnv: THREE.Texture;
	private direction: SceneDirection | null = null;
	private buildToken = 0;
	private timer = new THREE.Timer();
	private resizeObserver: ResizeObserver;
	private yaw = 0;

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
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		container.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.06;
		this.controls.minDistance = 0.7;
		this.controls.maxDistance = 5.5;
		this.controls.maxPolarAngle = Math.PI * 0.53;
		this.controls.autoRotateSpeed = 0.6;

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.fallbackEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		pmrem.dispose();

		this.sun.castShadow = true;
		this.sun.shadow.mapSize.set(4096, 4096);
		const s = this.sun.shadow.camera;
		s.left = s.bottom = -6;
		s.right = s.top = 6;
		s.near = 0.5;
		s.far = 40;
		this.sun.shadow.bias = -0.0002;
		this.sun.shadow.normalBias = 0.02;
		this.sun.shadow.radius = 3;
		this.scene.add(this.sun, this.sun.target, this.fill, this.avatarRig);

		// Seated-torso proxy under the bust so the person reads as sitting at the table.
		this.torso = new THREE.Mesh(
			new THREE.CapsuleGeometry(0.17, 0.3, 8, 24),
			new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.85 }),
		);
		this.torso.scale.set(1, 1, 0.62);
		this.torso.castShadow = this.torso.receiveShadow = true;
		this.avatarRig.add(this.torso);

		const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
		this.composer = new EffectComposer(this.renderer, rt);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
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
		this.composer.render();
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
			const start = this.built.cameraStart;
			this.camera.position.copy(start);
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

	setAvatar(handle: AvatarHandle | null) {
		if (this.avatar) {
			this.avatarRig.remove(this.avatar.object);
			this.avatar.dispose();
		}
		this.avatar = handle;
		if (handle) {
			this.avatarRig.add(handle.object);
			(this.torso.material as THREE.MeshStandardMaterial).color.copy(handle.clothing);
		}
		this.torso.visible = Boolean(handle);
		this.placeAvatar();
	}

	/** Rotates the avatar around its vertical axis (degrees) – generated meshes don't always face forward. */
	setAvatarYaw(deg: number) {
		this.yaw = THREE.MathUtils.degToRad(deg);
		if (this.avatar) this.avatar.object.rotation.y = this.yaw;
	}

	private placeAvatar() {
		const topY = this.built?.tableTopY ?? 0.75;
		// Bust base just below the table top, as if seated; torso proxy fills the chair.
		const baseY = topY - 0.06;
		this.avatarRig.position.set(0, 0, SITTER_Z);
		if (this.avatar) {
			this.avatar.object.position.y = baseY;
			this.avatar.object.rotation.y = this.yaw;
		}
		this.torso.position.set(0, baseY - 0.14, -0.02);
		const headY = baseY + 0.42;
		this.controls.target.set(0, headY - 0.12, SITTER_Z * 0.6);
		this.controls.update();
	}

	setAutoRotate(on: boolean) {
		this.controls.autoRotate = on;
	}

	screenshot(): string {
		this.composer.render();
		return this.renderer.domElement.toDataURL('image/png');
	}

	dispose() {
		this.renderer.setAnimationLoop(null);
		this.resizeObserver.disconnect();
		this.controls.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}
