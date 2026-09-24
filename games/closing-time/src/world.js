import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { N8AOPass } from 'n8ao';
import { W, D, CEIL, EXIT, buildLayout } from '../shared/layout.js';
import { instanceProps, floorTextures, ceilingTexture, wallTexture, signTexture, canvasTexture, propInstance } from './assets.js';

export const layout = buildLayout();

// Per-phase lighting targets. Values are blended over time so the blackout reads as a failure, not a cut.
const LOOK = {
	lobby: { key: 1.1, hemi: 0.42, env: 0.22, tube: 1, fog: 0.008, fogColor: 0x3a3c38, exposure: 0.9, emergency: 0, grain: 0.03 },
	opening: { key: 1.1, hemi: 0.42, env: 0.22, tube: 1, fog: 0.008, fogColor: 0x3a3c38, exposure: 0.9, emergency: 0, grain: 0.04 },
	lockdown: { key: 0, hemi: 0.035, env: 0.03, tube: 0, fog: 0.03, fogColor: 0x05060a, exposure: 1.0, emergency: 1, grain: 0.1 },
	finale: { key: 0, hemi: 0.05, env: 0.04, tube: 0, fog: 0.026, fogColor: 0x0a0405, exposure: 1.05, emergency: 1.4, grain: 0.13 },
	ended: { key: 0, hemi: 0.06, env: 0.05, tube: 0, fog: 0.02, fogColor: 0x05060a, exposure: 1.0, emergency: 1, grain: 0.1 }
};

const SOURCE = {
	tube: { color: 0xeef6ec, intensity: 9, distance: 12 },
	heat: { color: 0xff7a2a, intensity: 9, distance: 6 },
	till: { color: 0xfff1d6, intensity: 5, distance: 5 },
	jewel: { color: 0xffd6f0, intensity: 7, distance: 5 },
	freezer: { color: 0x7fd8ff, intensity: 7, distance: 7 },
	emergency: { color: 0xff1a10, intensity: 10, distance: 11 },
	exit: { color: 0x2dff6a, intensity: 5, distance: 7 },
	candle: { color: 0xffa040, intensity: 3.5, distance: 7 },
	ghost: { color: 0x9fc8ff, intensity: 4, distance: 6 },
	till_main: { color: 0xffe28a, intensity: 6, distance: 6 }
};

export class World {
	constructor(canvas, quality) {
		this.q = quality; // 'high' | 'low'
		const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', powerPreference: 'high-performance', stencil: false }));
		r.setPixelRatio(quality === 'low' ? 0.5 : Math.min(devicePixelRatio, 1.5));
		r.toneMapping = THREE.ACESFilmicToneMapping;
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.shadowMap.enabled = quality !== 'low';
		r.shadowMap.type = THREE.PCFShadowMap;
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x000000);
		this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 160);
		this.scene.add(this.camera);
		this.look = { ...LOOK.lobby };
		this.phase = 'lobby';
		this.time = 0;
		this.flicker = new Map();
		this.dynamicSources = [];
		this.haunt = 0;
	}

	async build() {
		const s = this.scene;
		const pm = new THREE.PMREMGenerator(this.renderer);
		s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
		s.environmentIntensity = this.look.env;
		s.fog = new THREE.FogExp2(this.look.fogColor, this.look.fog);

		// --- architecture ---
		const { map, rough } = floorTextures();
		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry(W, D),
			new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 0.55, metalness: 0.0, envMapIntensity: 1.4 })
		);
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(W / 2, 0, D / 2);
		floor.receiveShadow = true;
		s.add(floor);

		const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.95 }));
		ceil.rotation.x = Math.PI / 2;
		ceil.position.set(W / 2, CEIL, D / 2);
		s.add(ceil);

		const wtex = wallTexture();
		const wallMat = (len) => {
			const t = wtex.clone();
			t.wrapS = THREE.RepeatWrapping;
			t.repeat.set(len / 8, 1);
			t.needsUpdate = true;
			return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
		};
		const wall = (x, z, len, ry) => {
			const m = new THREE.Mesh(new THREE.PlaneGeometry(len, CEIL), wallMat(len));
			m.position.set(x, CEIL / 2, z);
			m.rotation.y = ry;
			m.receiveShadow = true;
			s.add(m);
		};
		wall(W / 2, D, W, Math.PI);
		wall(0, D / 2, D, Math.PI / 2);
		wall(W, D / 2, D, -Math.PI / 2);
		wall(EXIT.x0 / 2, 0, EXIT.x0, 0);
		wall((EXIT.x1 + W) / 2, 0, W - EXIT.x1, 0);
		// above the doors
		const lintel = new THREE.Mesh(new THREE.PlaneGeometry(EXIT.x1 - EXIT.x0, CEIL - 3.2), wallMat(8));
		lintel.position.set((EXIT.x0 + EXIT.x1) / 2, 3.2 + (CEIL - 3.2) / 2, 0);
		s.add(lintel);

		// exit doors + shutter + outside
		const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb6c0, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.25 });
		for (const x of [EXIT.x0 + 2, EXIT.x1 - 2]) {
			const door = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.1, 0.06), glass);
			door.position.set(x, 1.55, -0.2);
			s.add(door);
		}
		this.doors = s.children.slice(-2);
		const shutTex = canvasTexture(
			64,
			256,
			(ctx, w, h) => {
				for (let y = 0; y < h; y += 8) {
					ctx.fillStyle = y % 16 ? '#6d7074' : '#55585c';
					ctx.fillRect(0, y, w, 8);
				}
			},
			{ repeat: [1, 4] }
		);
		this.shutter = new THREE.Mesh(new THREE.BoxGeometry(EXIT.x1 - EXIT.x0, 3.2, 0.12), new THREE.MeshStandardMaterial({ map: shutTex, metalness: 0.7, roughness: 0.45 }));
		this.shutter.position.set((EXIT.x0 + EXIT.x1) / 2, 3.2 + 1.6, -0.45);
		this.shutter.castShadow = true;
		s.add(this.shutter);
		const lot = new THREE.Mesh(
			new THREE.PlaneGeometry(40, 16),
			new THREE.MeshStandardMaterial({
				map: canvasTexture(
					256,
					128,
					(ctx, w, h) => {
						ctx.fillStyle = '#1b1c1f';
						ctx.fillRect(0, 0, w, h);
						ctx.strokeStyle = '#d9d2a0';
						ctx.lineWidth = 3;
						for (let x = 10; x < w; x += 32) {
							ctx.beginPath();
							ctx.moveTo(x, h * 0.55);
							ctx.lineTo(x, h);
							ctx.stroke();
						}
					},
					{}
				),
				roughness: 0.9
			})
		);
		lot.rotation.x = -Math.PI / 2;
		lot.position.set(48, 0.001, -8);
		s.add(lot);

		// --- boxes (counters, glass, columns) ---
		const mats = {
			counter: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 }),
			belt: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 }),
			glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.02, transparent: true, opacity: 0.22, metalness: 0, depthWrite: false }),
			wood: new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.45 }),
			column: new THREE.MeshStandardMaterial({ color: 0xbdb8aa, roughness: 0.7 }),
			tiles: new THREE.MeshStandardMaterial({
				map: canvasTexture(
					128,
					128,
					(ctx) => {
						ctx.fillStyle = '#e8e8e8';
						ctx.fillRect(0, 0, 128, 128);
						ctx.strokeStyle = '#9a9a9a';
						for (let i = 0; i <= 128; i += 16) {
							ctx.beginPath();
							ctx.moveTo(i, 0);
							ctx.lineTo(i, 128);
							ctx.moveTo(0, i);
							ctx.lineTo(128, i);
							ctx.stroke();
						}
					},
					{ repeat: [8, 1] }
				),
				roughness: 0.2
			}),
			selfcheck: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.35, metalness: 0.3 })
		};
		for (const b of layout.boxes) {
			const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mats[b.mat]);
			m.position.set(b.x, b.y, b.z);
			m.castShadow = b.mat !== 'glass';
			m.receiveShadow = true;
			s.add(m);
		}
		// self-checkout screen
		this.tillScreenTex = signTexture('WELCOME', '#1d1d1d', '#e8f4ff', 512, 256);
		this.tillScreen = new THREE.Mesh(
			new THREE.PlaneGeometry(0.8, 0.5),
			new THREE.MeshStandardMaterial({ map: this.tillScreenTex, emissive: 0xffffff, emissiveMap: this.tillScreenTex, emissiveIntensity: 1.2 })
		);
		this.tillScreen.position.set(48, 1.75, 12.2);
		this.tillScreen.rotation.x = -0.25;
		s.add(this.tillScreen);
		const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), mats.selfcheck);
		pole.position.set(48, 1.7, 12.35);
		s.add(pole);
		// scanner bed with a red laser grid, bagging area and the "assistance" beacon
		const scanTex = canvasTexture(128, 128, (ctx) => {
			ctx.fillStyle = '#050505';
			ctx.fillRect(0, 0, 128, 128);
			ctx.strokeStyle = '#ff2a2a';
			ctx.lineWidth = 3;
			for (let i = -128; i < 256; i += 22) {
				ctx.beginPath();
				ctx.moveTo(i, 0);
				ctx.lineTo(i + 128, 128);
				ctx.moveTo(i + 128, 0);
				ctx.lineTo(i, 128);
				ctx.stroke();
			}
		});
		const scanner = new THREE.Mesh(
			new THREE.PlaneGeometry(0.7, 0.5),
			new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: scanTex, emissiveIntensity: 1.5, roughness: 0.05, metalness: 0.5 })
		);
		scanner.rotation.x = -Math.PI / 2;
		scanner.position.set(47.3, 1.011, 12.4);
		s.add(scanner);
		const bagging = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 1.2), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.3 }));
		bagging.position.set(48.7, 1.02, 12.3);
		s.add(bagging);
		for (const [dx, dz] of [
			[-0.25, -0.2],
			[0.25, 0.25]
		]) {
			const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), new THREE.MeshStandardMaterial({ color: 0xe9efe6, roughness: 0.7, transparent: true, opacity: 0.85 }));
			bag.position.set(48.7 + dx, 1.25, 12.3 + dz);
			bag.rotation.y = dx * 2;
			s.add(bag);
		}
		this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 16), new THREE.MeshBasicMaterial({ color: 0xff8a00, toneMapped: false }));
		this.beacon.position.set(48, 2.58, 12.35);
		s.add(this.beacon);

		// --- Kenney props (instanced) ---
		const props = await instanceProps(layout.props, {
			material: (m, name) => {
				if (name.includes('freezers-standing') || name.includes('freezer')) {
					const c = m.clone();
					c.emissive = new THREE.Color(0x3a90b0);
					c.emissiveIntensity = 0.25;
					c.emissiveMap = m.map;
					this.freezerMats = (this.freezerMats || []).concat(c);
					return c;
				}
				return m;
			}
		});
		s.add(props);

		// decorative produce + goods on displays and shelves for richness
		const extras = [];
		for (let i = 0; i < 240; i++) {
			const aisle = (Math.random() * 9) | 0;
			const cands = layout.spots['aisle' + aisle];
			const sp = cands[(Math.random() * cands.length) | 0];
			const m = ['food/can', 'food/carton', 'food/soda-bottle', 'food/bottle-ketchup', 'food/honey', 'food/peanut-butter', 'food/soda-can', 'food/cheese'][
				(Math.random() * 8) | 0
			];
			extras.push({ m, x: sp.x - sp.face * 0.2 + (Math.random() - 0.5) * 0.1, y: sp.y - 0.02, z: sp.z + (Math.random() - 0.5) * 1.6, ry: Math.random() * 6, s: [0.18, 0.22, 0.18] });
		}
		for (let x = 8; x < 26; x += 3.2)
			for (const z of [62.5, 66.5])
				for (let k = 0; k < 6; k++)
					extras.push({ m: ['food/apple', 'food/orange', 'food/pineapple', 'food/cabbage', 'food/pumpkin', 'food/banana'][k], x: x + ((k % 3) - 1) * 0.45, y: 1.02, z: z + (k < 3 ? -0.3 : 0.3), ry: Math.random() * 6, s: [0.35, 0.3, 0.35] });
		for (let x = 45.5; x < 64; x += 1.3) extras.push({ m: 'food/turkey', x, y: 1.1, z: 68.8, ry: Math.random(), s: [0.45, 0.2, 0.4] });
		for (let z = 4; z < 60; z += 13) extras.push({ m: 'furniture/pottedPlant', x: 94.8, y: 0, z, ry: 0, s: [0.9, 1.6, 0.9] });
		s.add(await instanceProps(extras));

		// --- signage ---
		this.signs = {};
		for (const sg of layout.signs) {
			const tex = signTexture(sg.text, sg.color || '#ffffff', sg.bg || '#123b2a');
			const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.6 });
			const m = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), mat);
			m.position.set(sg.x, sg.y, sg.z);
			m.rotation.y = sg.ry;
			if (sg.wall) m.translateZ(0.05);
			s.add(m);
			if (sg.hang || sg.twoSided) {
				const back = new THREE.Mesh(m.geometry, mat);
				back.rotation.y = Math.PI;
				back.position.z = -0.01;
				m.add(back);
			}
			if (sg.hang) {
				for (const dx of [-sg.w / 2 + 0.3, sg.w / 2 - 0.3]) {
					const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, CEIL - sg.y - sg.h / 2), new THREE.MeshBasicMaterial({ color: 0x333333 }));
					wire.position.copy(m.position);
					wire.position.y = (CEIL + sg.y + sg.h / 2) / 2;
					const off = new THREE.Vector3(dx, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), sg.ry);
					wire.position.add(off);
					s.add(wire);
				}
			}
			if (sg.key) this.signs[sg.key] = { mesh: m, mat, def: sg };
		}
		this.signMats = s.children.filter((o) => o.isMesh && o.material.emissiveMap && o !== this.tillScreen).map((o) => o.material);

		this.buildLights();
		this.buildPost();
		this.graveGroup = new THREE.Group();
		s.add(this.graveGroup);
		this.graveKeys = new Set();
		return this;
	}

	buildLights() {
		const s = this.scene;
		// Overhead key light: a soft top-down "sky" of fluorescent tubes that gives grounded shadows.
		this.hemi = new THREE.HemisphereLight(0xf4f6ff, 0x8a8478, this.look.hemi);
		s.add(this.hemi);
		this.key = new THREE.DirectionalLight(0xf5f7ff, this.look.key);
		this.key.castShadow = this.q !== 'low';
		this.key.shadow.mapSize.set(2048, 2048);
		const sc = this.key.shadow.camera;
		sc.left = sc.bottom = -28;
		sc.right = sc.top = 28;
		sc.near = 1;
		sc.far = 40;
		this.key.shadow.bias = -0.0004;
		this.key.shadow.normalBias = 0.03;
		this.key.shadow.radius = 4;
		s.add(this.key, this.key.target);

		// Fluorescent fixtures: housings + emissive diffusers with per-instance brightness.
		const tubes = layout.lights.filter((l) => l.kind === 'tube');
		this.tubes = tubes;
		const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 2.4), new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5, metalness: 0.3 }), tubes.length);
		this.tubeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.04, 2.3), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), tubes.length);
		const dm = new THREE.Object3D();
		tubes.forEach((t, i) => {
			dm.position.set(t.x, t.y + 0.1, t.z);
			dm.updateMatrix();
			housing.setMatrixAt(i, dm.matrix);
			dm.position.y = t.y + 0.02;
			dm.updateMatrix();
			this.tubeMesh.setMatrixAt(i, dm.matrix);
			this.tubeMesh.setColorAt(i, new THREE.Color(3, 3, 3.2));
			t.phase = Math.random() * 100;
			t.broken = Math.random() < 0.04;
		});
		s.add(housing, this.tubeMesh);

		// Small emissive markers for other light kinds
		const bulbGeo = new THREE.SphereGeometry(0.12, 12, 8);
		this.bulbs = [];
		for (const l of layout.lights) {
			if (l.kind === 'tube') continue;
			const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(SOURCE[l.kind].color).multiplyScalar(2), toneMapped: false });
			const b = new THREE.Mesh(l.kind === 'emergency' ? new THREE.BoxGeometry(0.5, 0.18, 0.12) : bulbGeo, mat);
			b.position.set(l.x, l.y, l.z);
			if (l.kind === 'freezer') b.visible = false;
			s.add(b);
			this.bulbs.push({ l, b, mat });
		}

		// Light pool: the N most relevant point sources are bound to real lights every frame.
		this.sources = layout.lights.map((l) => ({ ...l, pos: new THREE.Vector3(l.x, l.y - 0.2, l.z), def: SOURCE[l.kind], level: 0 }));
		this.sources.push({ kind: 'exit', pos: new THREE.Vector3(48, 3.0, 0.8), def: SOURCE.exit, level: 0 });
		this.sources.push({ kind: 'till_main', pos: new THREE.Vector3(48, 2.2, 12.5), def: SOURCE.till_main, level: 0 });
		const N = this.q === 'low' ? 6 : 14;
		this.pool = [];
		for (let i = 0; i < N; i++) {
			const pl = new THREE.PointLight(0xffffff, 0, 10, 2);
			s.add(pl);
			this.pool.push(pl);
		}

		// Player torch (local) - shadowed spotlight with a faint volumetric cone.
		this.torch = new THREE.SpotLight(0xfff2dc, 0, 30, 0.42, 0.45, 1.25);
		this.torch.castShadow = this.q !== 'low';
		this.torch.shadow.mapSize.set(1024, 1024);
		this.torch.shadow.bias = -0.0006;
		this.torch.shadow.camera.near = 0.2;
		this.torch.position.set(0.18, -0.2, 0.1);
		this.camera.add(this.torch);
		this.torch.target.position.set(0.05, -0.1, -5);
		this.camera.add(this.torch.target);
		this.torch.map = canvasTexture(128, 128, (ctx, w, h) => {
			const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
			g.addColorStop(0, '#fff');
			g.addColorStop(0.18, '#fffbe8');
			g.addColorStop(0.3, '#b8b0a0');
			g.addColorStop(0.42, '#d8d0c0');
			g.addColorStop(0.7, '#6a6258');
			g.addColorStop(1, '#000');
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, w, h);
		});
		this.remoteTorches = [];
		this.beamMat = new THREE.ShaderMaterial({
			uniforms: { strength: { value: 0 } },
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
			vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
				void main(){ vT = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
			fragmentShader: `uniform float strength; varying float vT; varying vec3 vN; varying vec3 vV;
				void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = pow(vT, 2.2) * edge * strength; gl_FragColor = vec4(vec3(1.0,0.93,0.8)*a, a); }`
		});
		this.localBeam = this.makeBeam();
		this.localBeam.position.set(0.18, -0.2, 0.1);
		this.camera.add(this.localBeam);
	}

	// Remote players' torches share a small pool of unshadowed spotlights.
	remoteTorch(i) {
		if (!this.remoteTorches[i]) {
			const sp = new THREE.SpotLight(0xfff0d8, 0, 24, 0.42, 0.5, 1.25);
			sp.castShadow = this.q !== 'low' && i === 0;
			sp.shadow.mapSize.set(512, 512);
			sp.map = this.torch.map;
			sp.beam = this.makeBeam();
			this.scene.add(sp, sp.target, sp.beam);
			this.remoteTorches[i] = sp;
		}
		return this.remoteTorches[i];
	}

	// Faint volumetric cone so torch beams read in the dusty dark.
	makeBeam() {
		const len = 11;
		const geo = new THREE.ConeGeometry(Math.tan(0.4) * len, len, 24, 1, true);
		geo.translate(0, -len / 2, 0);
		geo.rotateX(-Math.PI / 2); // apex at origin, opening towards -z
		const m = new THREE.Mesh(geo, this.beamMat.clone());
		m.renderOrder = 5;
		m.frustumCulled = false;
		return m;
	}

	buildPost() {
		if (this.q === 'low') return;
		const r = this.renderer;
		this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 }));
		try {
			this.ao = new N8AOPass(this.scene, this.camera, 1, 1);
			this.ao.configuration.aoRadius = 1.2;
			this.ao.configuration.distanceFalloff = 0.6;
			this.ao.configuration.intensity = 3.2;
			this.ao.configuration.halfRes = true;
			this.ao.configuration.gammaCorrection = false;
			this.ao.configuration.screenSpaceRadius = false;
			this.composer.addPass(this.ao);
		} catch (e) {
			console.warn('AO unavailable', e);
			this.composer.addPass(new RenderPass(this.scene, this.camera));
		}
		this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.5, 1.0);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());
		this.fx = new ShaderPass({
			uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.05 }, hurt: { value: 0 }, vignette: { value: 0.35 }, aberr: { value: 0 } },
			vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
			fragmentShader: `
				uniform sampler2D tDiffuse; uniform float time, grain, hurt, vignette, aberr; varying vec2 vUv;
				float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*37.1)*43758.5453); }
				void main(){
					vec2 d = vUv-0.5; float r = length(d);
					vec2 off = d * aberr * 0.012;
					vec3 c = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);
					c *= 1.0 - vignette * smoothstep(0.25, 0.85, r);
					c = mix(c, vec3(0.45,0.0,0.0), hurt * smoothstep(0.15, 0.75, r));
					c += (h(vUv) - 0.5) * grain;
					gl_FragColor = vec4(c, 1.0);
				}`
		});
		this.composer.addPass(this.fx);
	}

	resize(w, h) {
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		if (this.composer) {
			const pr = this.renderer.getPixelRatio();
			this.composer.setSize(w, h);
			this.ao?.setSize?.(w * pr, h * pr);
			this.bloom.setSize(w * pr * 0.5, h * pr * 0.5);
		}
	}

	setPhase(ph) {
		this.phase = ph;
	}

	blackout() {
		// Tubes die in a rolling wave from the entrance to the back of the store
		for (const t of this.tubes) t.dieAt = this.time + 0.2 + (t.z / 72) * 2.2 + Math.random() * 0.5;
		this.stutterUntil = this.time + 3.5;
	}

	setSign(key, text, color, bg) {
		const s = this.signs[key];
		if (!s || s.text === text) return;
		s.text = text;
		const tex = signTexture(text, color, bg);
		s.mat.map = tex;
		s.mat.emissiveMap = tex;
		s.mat.needsUpdate = true;
	}

	async setGraves(graves) {
		for (const g of graves) {
			const k = `${g.x},${g.z}`;
			if (this.graveKeys.has(k)) continue;
			this.graveKeys.add(k);
			const names = ['graveyard/gravestone-round', 'graveyard/gravestone-cross', 'graveyard/gravestone-broken', 'graveyard/gravestone-bevel'];
			const stone = await propInstance(names[g.v % 4], 1.3);
			stone.position.set(g.x, -1.4, g.z);
			stone.rotation.y = g.ry;
			stone.userData.rise = 0;
			const dirt = new THREE.Mesh(
				new THREE.CircleGeometry(1.4, 20),
				new THREE.MeshStandardMaterial({
					map: canvasTexture(128, 128, (ctx) => {
						const gr = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
						gr.addColorStop(0, 'rgba(40,28,18,1)');
						gr.addColorStop(0.6, 'rgba(50,36,22,0.9)');
						gr.addColorStop(1, 'rgba(50,36,22,0)');
						ctx.fillStyle = gr;
						ctx.fillRect(0, 0, 128, 128);
						for (let i = 0; i < 60; i++) {
							ctx.fillStyle = 'rgba(200,196,188,0.8)';
							ctx.fillRect(40 + Math.random() * 48, 40 + Math.random() * 48, 4 + Math.random() * 8, 3 + Math.random() * 6);
						}
					}),
					transparent: true,
					roughness: 1,
					depthWrite: false
				})
			);
			dirt.rotation.x = -Math.PI / 2;
			dirt.position.set(g.x, 0.01, g.z);
			this.graveGroup.add(stone, dirt);
			this.risingStones = (this.risingStones || []).concat(stone);
		}
	}

	update(dt, ctx) {
		this.time += dt;
		const target = LOOK[this.phase] || LOOK.lobby;
		const k = Math.min(1, dt * (this.phase === 'lockdown' ? 0.9 : 1.5));
		for (const key of Object.keys(target)) {
			if (key === 'fogColor') continue;
			this.look[key] += (target[key] - this.look[key]) * k;
		}
		const stutter = this.stutterUntil && this.time < this.stutterUntil;
		const flick = stutter ? (Math.random() < 0.5 ? 0.15 : 1) : 1;
		this.hemi.intensity = this.look.hemi * flick;
		this.key.intensity = this.look.key * flick;
		this.scene.environmentIntensity = this.look.env * flick;
		this.scene.fog.density = this.look.fog;
		this.scene.fog.color.lerp(new THREE.Color(target.fogColor), k);
		this.renderer.toneMappingExposure = this.look.exposure;

		// shadow frustum follows the camera
		const cp = this.camera.getWorldPosition(new THREE.Vector3());
		this.key.position.set(cp.x + 3, CEIL + 12, cp.z + 5);
		this.key.target.position.set(cp.x, 0, cp.z);

		// tubes
		const dark = this.phase === 'lockdown' || this.phase === 'finale' || this.phase === 'ended';
		const col = new THREE.Color();
		this.tubes.forEach((t, i) => {
			let lv = 1;
			if (dark) {
				lv = t.dieAt && this.time < t.dieAt ? 1 : 0;
				// a few tubes keep sputtering in the dark - they are the only landmarks
				if (!lv && t.broken) {
					const n = Math.sin(this.time * 23 + t.phase) * Math.sin(this.time * 7.3 + t.phase * 2);
					lv = n > 0.55 ? 0.9 : n > 0.4 ? 0.2 : 0;
				}
			} else {
				t.dieAt = null;
				if (t.broken) lv = Math.sin(this.time * 31 + t.phase) > 0.92 ? 0.1 : 1;
				lv *= flick;
			}
			t.level = lv;
			col.setRGB(3 * lv + 0.05, 3 * lv + 0.05, 3.2 * lv + 0.06);
			this.tubeMesh.setColorAt(i, col);
		});
		this.tubeMesh.instanceColor.needsUpdate = true;

		// source levels
		const pulse = 0.75 + 0.25 * Math.sin(this.time * 3.1);
		for (const src of this.sources) {
			switch (src.kind) {
				case 'emergency':
					src.level = this.look.emergency * pulse;
					break;
				case 'freezer':
					src.level = dark ? 0.9 + 0.1 * Math.sin(this.time * 50 + src.z) : 0.6;
					break;
				case 'heat':
					src.level = dark ? 0.8 : 0.6;
					break;
				case 'till':
					src.level = dark ? 0 : 0.8;
					break;
				case 'jewel':
					src.level = dark ? 0.5 + 0.5 * Math.random() * (Math.random() < 0.1) : 1;
					break;
				case 'exit':
					src.level = this.phase === 'finale' ? 1.6 * (0.6 + 0.4 * Math.sin(this.time * 8)) : dark ? 0 : 0.4;
					src.def = this.phase === 'finale' ? SOURCE.exit : SOURCE.emergency;
					break;
				case 'till_main':
					src.level = dark ? 1 : 0.4;
					break;
			}
		}
		if (!this._tubeIndex) {
			this._tubeIndex = new Map(this.tubes.map((t) => [`${t.x},${t.z}`, t]));
			for (const src of this.sources) if (src.kind === 'tube') src.tube = this._tubeIndex.get(`${src.x},${src.z}`);
		}
		for (const src of this.sources) if (src.tube) src.level = src.tube.level;
		for (const bl of this.bulbs) {
			const src = (bl.src ??= this.sources.find((s2) => s2.x === bl.l.x && s2.z === bl.l.z && s2.kind === bl.l.kind));
			bl.mat.color.set(SOURCE[bl.l.kind].color).multiplyScalar(0.2 + 2.5 * (src?.level || 0));
		}
		for (const fm of this.freezerMats || []) fm.emissiveIntensity = dark ? 0.55 + 0.05 * Math.sin(this.time * 40) : 0.25;
		for (const sm of this.signMats) sm.emissiveIntensity = dark ? 0.04 : 0.35;
		const ex = this.signs.exitSign;
		if (ex) ex.mat.emissiveIntensity = this.phase === 'finale' ? 2.5 : dark ? 1.4 : 0.8;
		const sn = this.signs.storeName;
		if (sn) sn.mat.emissiveIntensity = dark ? (Math.random() < 0.03 ? 1.2 : 0.02) : 0.7;
		this.tillScreen.material.emissiveIntensity = 1.2;
		const alarm = this.phase === 'finale' || (this.scanFlash && this.time < this.scanFlash);
		this.beacon.material.color.setRGB(alarm && Math.sin(this.time * 14) > 0 ? 4 : 0.35, alarm && Math.sin(this.time * 14) > 0 ? 1.6 : 0.15, 0);

		// assign pool
		const all = this.sources.concat(ctx.dynamicSources || []);
		const scored = [];
		for (const src of all) {
			if (src.level <= 0.01) continue;
			const d2 = src.pos.distanceToSquared(cp);
			const reach = src.def.distance * 2.2;
			if (d2 > reach * reach) continue;
			scored.push([(src.def.intensity * src.level) / (1 + d2), src]);
		}
		scored.sort((a, b) => b[0] - a[0]);
		this.pool.forEach((pl, i) => {
			const e = scored[i];
			if (!e) {
				pl.intensity = 0;
				pl.visible = false;
				return;
			}
			const src = e[1];
			pl.visible = true;
			pl.position.copy(src.pos);
			pl.color.set(src.def.color);
			pl.distance = src.def.distance;
			pl.intensity = src.def.intensity * src.level;
		});

		// shutters/doors
		const shutY = this.phase === 'lobby' || this.phase === 'opening' ? 4.8 : this.phase === 'finale' || this.phase === 'ended' ? 4.8 : 1.6;
		this.shutter.position.y += (shutY - this.shutter.position.y) * Math.min(1, dt * (shutY < 3 ? 2.2 : 0.8));
		for (const [i, d] of this.doors.entries()) {
			const open = this.phase === 'finale' || this.phase === 'ended';
			const tx = (i ? EXIT.x1 - 2 : EXIT.x0 + 2) + (open ? (i ? 3.5 : -3.5) : 0);
			d.position.x += (tx - d.position.x) * Math.min(1, dt * 2);
		}

		for (const st of this.risingStones || []) if (st.position.y < -0.05) st.position.y += dt * 0.9;

		// post
		if (this.fx) {
			this.fx.uniforms.time.value = this.time;
			this.fx.uniforms.grain.value = this.look.grain + this.haunt * 0.02;
			this.fx.uniforms.hurt.value += ((ctx.hurt || 0) - this.fx.uniforms.hurt.value) * Math.min(1, dt * 4);
			this.fx.uniforms.vignette.value = dark ? 0.6 : 0.35;
			this.fx.uniforms.aberr.value = (ctx.fear || 0) * 1.2 + (ctx.hurt || 0);
		}
		if (this.bloom) this.bloom.strength = dark ? 0.8 : 0.28;
	}

	render() {
		if (this.composer) this.composer.render();
		else this.renderer.render(this.scene, this.camera);
	}
}
