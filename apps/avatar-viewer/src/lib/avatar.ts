import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Loads the generated full-body mesh (GLB) and stands it up at the person's
// real height, feet on the floor at y = 0, facing +Z.

export interface AvatarHandle {
	object: THREE.Group;
	dispose(): void;
}

function disposeTree(root: THREE.Object3D) {
	root.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.geometry.dispose();
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of mats) {
			for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
			m.dispose();
		}
	});
}

// ---------------- photo helpers ----------------

export async function loadImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.crossOrigin = 'anonymous';
	img.src = src;
	await img.decode();
	return img;
}

/** Downscale to a JPEG data URL (keeps uploads and Claude image tokens small). */
export function toDataUrl(img: HTMLImageElement, max = 1536): string {
	const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
	const c = document.createElement('canvas');
	c.width = Math.round(img.naturalWidth * s);
	c.height = Math.round(img.naturalHeight * s);
	c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
	return c.toDataURL('image/jpeg', 0.92);
}

// ---------------- mesh ----------------

export async function loadPersonMesh(url: string, heightM: number): Promise<AvatarHandle> {
	const gltf = await new GLTFLoader().loadAsync(url);
	const model = gltf.scene;
	model.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of mats as THREE.MeshStandardMaterial[]) {
			// Generated materials tend to come out glossy or metallic; skin and cloth are neither.
			if ('metalness' in m) m.metalness = 0;
			if ('roughness' in m) m.roughness = Math.max(m.roughness, 0.7);
			if (m.map) m.map.anisotropy = 8;
		}
	});

	// Normalise: scale to real height, feet at y = 0, centred on x/z.
	const box = new THREE.Box3().setFromObject(model);
	const size = box.getSize(new THREE.Vector3());
	const centre = box.getCenter(new THREE.Vector3());
	model.position.set(-centre.x, -box.min.y, -centre.z);
	const holder = new THREE.Group();
	holder.add(model);
	holder.scale.setScalar(heightM / size.y);
	const group = new THREE.Group();
	group.add(holder);
	group.name = 'person';
	return { object: group, dispose: () => disposeTree(group) };
}
