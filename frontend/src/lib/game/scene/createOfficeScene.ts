import * as THREE from 'three';
import carpetUrl from '$lib/game/assets/textures/carpet.webp';
import ceilingUrl from '$lib/game/assets/textures/ceiling_tiles_color.png';
import wallpaperUrl from '$lib/game/assets/textures/wallpaper.png';
import wallpaper2Url from '$lib/game/assets/textures/wallpaper2.png';
import woodUrl from '$lib/game/assets/textures/wood.jpeg';
import { OfficeLight } from './OfficeLight';
import {
	CEILING_HEIGHT,
	createLightPlacements,
	createOfficeWalls,
	DOORWAY_WIDTH,
	LAYOUT_EXTENTS,
	SECURE_DOOR_Z,
	WALL_THICKNESS
} from './OfficeLayout';

export { DOORWAY_WIDTH, OFFICE_BOUNDS, SECURE_DOOR_Z } from './OfficeLayout';

export interface CollisionBox { minX: number; maxX: number; minZ: number; maxZ: number; }
export interface OfficeScene {
	scene: THREE.Scene;
	loginKiosk: THREE.Group;
	loginScreenMaterial: THREE.MeshStandardMaterial;
	jobBoard: THREE.Group;
	jobBoardMaterial: THREE.MeshStandardMaterial;
	closetDoor: THREE.Group;
	wallColliders: CollisionBox[];
	updateLights: (elapsedSeconds: number) => void;
	dispose: () => void;
}

function makeCanvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas rendering is unavailable');
	draw(context);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function loadRepeatingTexture(url: string, repeat: [number, number], track: <T extends THREE.Texture>(texture: T) => T): THREE.Texture {
	const texture = track(new THREE.TextureLoader().load(url));
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(...repeat);
	texture.anisotropy = 8;
	return texture;
}

function makeLoginTexture(): THREE.CanvasTexture {
	return makeCanvasTexture(768, 384, (context) => {
		context.fillStyle = '#0b0d08'; context.fillRect(0, 0, 768, 384);
		context.strokeStyle = '#ece8ae'; context.lineWidth = 10; context.strokeRect(22, 22, 724, 340);
		context.fillStyle = '#fffbc5'; context.textAlign = 'center'; context.font = '700 33px monospace';
		context.fillText('PERSONNEL TERMINAL', 384, 105);
		context.font = '800 60px monospace'; context.fillText('SIGN IN', 384, 215);
		context.fillStyle = '#d0cd91'; context.font = '600 25px monospace'; context.fillText('EXIT REMAINS LOCKED', 384, 292);
	});
}

function makeBoardTexture(): THREE.CanvasTexture {
	return makeCanvasTexture(1024, 640, (context) => {
		context.fillStyle = '#6d4d2f'; context.fillRect(0, 0, 1024, 640);
		context.fillStyle = '#241c12'; context.fillRect(32, 28, 960, 92);
		context.fillStyle = '#d6cf91'; context.textAlign = 'center'; context.font = '800 58px monospace';
		context.fillText('JOB BOARD', 512, 92);
		for (let index = 0; index < 8; index += 1) {
			const column = index % 4; const row = Math.floor(index / 4);
			const x = 54 + column * 239; const y = 158 + row * 218;
			context.fillStyle = index % 3 === 0 ? '#d8d1a2' : '#c9c7ae'; context.fillRect(x, y, 198, 174);
			context.fillStyle = '#565442';
			context.fillRect(x + 20, y + 28, 132, 11); context.fillRect(x + 20, y + 55, 158, 7);
			context.fillRect(x + 20, y + 76, 112, 7); context.fillRect(x + 20, y + 126, 72, 7);
		}
	});
}

export function createOfficeScene(): OfficeScene {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#12130d');
	scene.fog = new THREE.FogExp2('#2e3020', 0.016);
	const disposable: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
	const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T => { disposable.push(resource); return resource; };

	const primaryWallpaper = loadRepeatingTexture(wallpaperUrl, [2.8, 1.35], track);
	const secondaryWallpaper = loadRepeatingTexture(wallpaper2Url, [2.4, 1.8], track);
	const carpetTexture = loadRepeatingTexture(carpetUrl, [18, 18], track);
	const ceilingTexture = loadRepeatingTexture(ceilingUrl, [9, 8], track);
	const woodTexture = loadRepeatingTexture(woodUrl, [1.5, 1], track);
	const wallMaterials = {
		primary: track(new THREE.MeshStandardMaterial({ map: primaryWallpaper, color: '#bbb77a', roughness: 0.94 })),
		secondary: track(new THREE.MeshStandardMaterial({ map: secondaryWallpaper, color: '#969256', roughness: 0.97 }))
	};

	const layoutWidth = LAYOUT_EXTENTS.maxX - LAYOUT_EXTENTS.minX;
	const layoutDepth = LAYOUT_EXTENTS.maxZ - LAYOUT_EXTENTS.minZ;
	const layoutCenterX = (LAYOUT_EXTENTS.minX + LAYOUT_EXTENTS.maxX) / 2;
	const layoutCenterZ = (LAYOUT_EXTENTS.minZ + LAYOUT_EXTENTS.maxZ) / 2;
	const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(layoutWidth, layoutDepth)), track(new THREE.MeshStandardMaterial({ map: carpetTexture, color: '#77704a', roughness: 1 })));
	floor.rotation.x = -Math.PI / 2; floor.position.set(layoutCenterX, 0, layoutCenterZ); floor.receiveShadow = true; scene.add(floor);
	const ceiling = new THREE.Mesh(track(new THREE.PlaneGeometry(layoutWidth, layoutDepth)), track(new THREE.MeshStandardMaterial({ map: ceilingTexture, color: '#aaa77a', roughness: 1 })));
	ceiling.rotation.x = Math.PI / 2; ceiling.position.set(layoutCenterX, CEILING_HEIGHT, layoutCenterZ); ceiling.receiveShadow = true; scene.add(ceiling);

	const wallGeometry = track(new THREE.BoxGeometry(1, CEILING_HEIGHT, WALL_THICKNESS));
	const wallColliders: CollisionBox[] = [];
	for (const spec of createOfficeWalls()) {
		const length = spec.to - spec.from;
		const wall = new THREE.Mesh(wallGeometry, wallMaterials[spec.finish ?? 'primary']);
		if (spec.axis === 'x') {
			wall.position.set((spec.from + spec.to) / 2, CEILING_HEIGHT / 2, spec.fixed); wall.scale.x = length;
			wallColliders.push({ minX: spec.from, maxX: spec.to, minZ: spec.fixed - WALL_THICKNESS / 2, maxZ: spec.fixed + WALL_THICKNESS / 2 });
		} else {
			wall.position.set(spec.fixed, CEILING_HEIGHT / 2, (spec.from + spec.to) / 2); wall.rotation.y = Math.PI / 2; wall.scale.x = length;
			wallColliders.push({ minX: spec.fixed - WALL_THICKNESS / 2, maxX: spec.fixed + WALL_THICKNESS / 2, minZ: spec.from, maxZ: spec.to });
		}
		wall.receiveShadow = true; scene.add(wall);
	}

	// A single flat slab, derived from the doorway width: no handle and no edge gap.
	const closetDoor = new THREE.Group();
	closetDoor.position.set(-DOORWAY_WIDTH / 2, 0, SECURE_DOOR_Z + 0.16);
	const doorWidth = DOORWAY_WIDTH + 0.06;
	const doorHeight = CEILING_HEIGHT - 0.04;
	const door = new THREE.Mesh(track(new THREE.BoxGeometry(doorWidth, doorHeight, 0.11)), track(new THREE.MeshStandardMaterial({ map: woodTexture, color: '#8b765d', roughness: 0.82, metalness: 0.02 })));
	door.position.set(doorWidth / 2, doorHeight / 2, 0); door.castShadow = true; closetDoor.add(door); scene.add(closetDoor);

	const loginKiosk = new THREE.Group(); loginKiosk.position.set(2.14, 0, 7.65); loginKiosk.rotation.y = -Math.PI / 2;
	const kioskBody = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 2.15, 0.55)), track(new THREE.MeshStandardMaterial({ color: '#302f24', roughness: 0.55, metalness: 0.35 })));
	kioskBody.position.y = 1.08; kioskBody.castShadow = true; loginKiosk.add(kioskBody);
	const loginScreenMaterial = track(new THREE.MeshStandardMaterial({ map: track(makeLoginTexture()), emissive: '#b4b16a', emissiveIntensity: 0.38, roughness: 0.3 }));
	const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(1.3, 0.74)), loginScreenMaterial); screen.position.set(0, 1.38, 0.281); loginKiosk.add(screen); scene.add(loginKiosk);

	const jobBoard = new THREE.Group(); jobBoard.position.set(-2.1, 2.15, -9.16);
	const boardBacking = new THREE.Mesh(track(new THREE.BoxGeometry(5.6, 3.25, 0.24)), track(new THREE.MeshStandardMaterial({ color: '#332719', roughness: 0.82 })));
	boardBacking.castShadow = true; jobBoard.add(boardBacking);
	const jobBoardMaterial = track(new THREE.MeshStandardMaterial({ map: track(makeBoardTexture()), emissive: '#7a7040', emissiveIntensity: 0.08, roughness: 0.88 }));
	const boardFace = new THREE.Mesh(track(new THREE.PlaneGeometry(5.3, 2.95)), jobBoardMaterial); boardFace.position.z = 0.126; jobBoard.add(boardFace); scene.add(jobBoard);

	const deskMaterial = track(new THREE.MeshStandardMaterial({ color: '#423723', roughness: 0.82 }));
	const desktop = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.16, 1.65)), deskMaterial); desktop.position.set(3.1, 1.02, -2.4); desktop.castShadow = true; scene.add(desktop);
	for (const x of [1.62, 4.58]) { const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 1, 1.35)), deskMaterial); leg.position.set(x, 0.5, -2.4); scene.add(leg); }
	const monitor = new THREE.Mesh(track(new THREE.BoxGeometry(1.25, 0.85, 0.18)), track(new THREE.MeshStandardMaterial({ color: '#171710', roughness: 0.55 })));
	monitor.position.set(3.1, 1.56, -2.62); monitor.castShadow = true; scene.add(monitor);

	scene.add(new THREE.HemisphereLight('#d8d4a2', '#343525', 1.1));
	const lights = createLightPlacements().map((placement, index) => new OfficeLight({
		position: [placement.x, CEILING_HEIGHT - 0.25, placement.z],
		intensity: placement.intensity,
		range: placement.range,
		seed: placement.seed,
		fixtureLength: placement.fixtureLength,
		rotation: placement.rotation,
		castShadow: index === 2
	}));
	for (const fixture of lights) scene.add(fixture.group);

	return {
		scene, loginKiosk, loginScreenMaterial, jobBoard, jobBoardMaterial, closetDoor, wallColliders,
		updateLights: (elapsedSeconds) => lights.forEach((light) => light.update(elapsedSeconds)),
		dispose: () => { lights.forEach((light) => light.dispose()); disposable.forEach((resource) => resource.dispose()); }
	};
}
