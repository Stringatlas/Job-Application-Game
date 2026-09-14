import * as THREE from 'three';
import carpetUrl from '$lib/game/assets/textures/carpet-low.jpeg';
import ceilingUrl from '$lib/game/assets/textures/ceiling_tiles_color-low.jpeg';
import wallpaperUrl from '$lib/game/assets/textures/wallpaper-low.jpeg';
import wallpaper2Url from '$lib/game/assets/textures/wallpaper2-low.jpeg';
import woodUrl from '$lib/game/assets/textures/wood-low.jpeg';
import {
	RoomChunkManager,
	type CollisionBox,
	type ProceduralWorldBounds
} from '../rooms/RoomChunkManager';
import {
	assertProceduralGenerationDeterminism,
	generateProceduralRoomGraph,
	WORLD_SEED
} from '../rooms/ProceduralRoomGraph';
import { OfficeLight } from './OfficeLight';
import {
	ALL_SPACES,
	CEILING_HEIGHT,
	createLightPlacements,
	createOfficeWalls,
	DOORWAY_WIDTH,
	LAYOUT_EXTENTS,
	OPENINGS,
	ROOMS,
	SECURE_DOOR_Z,
	WALL_THICKNESS
} from './OfficeLayout';

export { DOORWAY_WIDTH, OFFICE_BOUNDS, SECURE_DOOR_Z } from './OfficeLayout';

export interface OfficeScene {
	scene: THREE.Scene;
	loginKiosk: THREE.Group;
	jobBoard: THREE.Group;
	jobBoardMaterial: THREE.MeshStandardMaterial;
	closetDoor: THREE.Group;
	worldBounds: ProceduralWorldBounds;
	collidesWithWall: (position: THREE.Vector3, radius: number) => boolean;
	update: (playerPosition: THREE.Vector3, elapsedSeconds: number) => void;
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
	texture.anisotropy = 2;
	return texture;
}

function makeLoginTexture(): THREE.CanvasTexture {
	return makeCanvasTexture(768, 384, (context) => {
		context.fillStyle = '#d8cfad'; context.fillRect(0, 0, 768, 384);
		for (const [x, y, radius] of [[92, 48, 82], [682, 326, 104], [318, 205, 58]] as const) {
			const stain = context.createRadialGradient(x, y, 4, x, y, radius);
			stain.addColorStop(0, 'rgba(92, 62, 34, 0.18)');
			stain.addColorStop(1, 'rgba(92, 62, 34, 0)');
			context.fillStyle = stain; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
		}
		context.strokeStyle = 'rgba(67, 45, 29, 0.2)'; context.lineWidth = 10;
		context.strokeRect(5, 5, 758, 374);
		context.fillStyle = '#3e382e'; context.textAlign = 'center'; context.font = '700 38px Georgia, serif';
		context.fillText('EMPLOYEE SIGN-IN SHEET', 384, 55);
		context.font = 'italic 19px Georgia, serif'; context.fillText('Please print clearly', 384, 85);
		context.textAlign = 'left'; context.font = '700 20px Arial, sans-serif';
		context.fillText('NAME', 45, 122); context.fillText('TIME', 585, 122);
		context.strokeStyle = 'rgba(83, 75, 61, 0.7)'; context.lineWidth = 2;
		context.beginPath();
		context.moveTo(38, 134); context.lineTo(730, 134);
		context.moveTo(560, 104); context.lineTo(560, 360);
		for (let y = 178; y <= 354; y += 44) {
			context.moveTo(38, y); context.lineTo(730, y);
		}
		context.stroke();
		context.fillStyle = 'rgba(49, 43, 37, 0.72)'; context.font = 'italic 25px "Bradley Hand", cursive';
		context.fillText('M. Harrow', 58, 166); context.fillText('11:48 PM', 590, 166);
		context.fillText('Evelyn G.', 52, 210); context.fillText('12:13 AM', 587, 210);
		context.fillStyle = 'rgba(74, 30, 27, 0.72)';
		context.fillText('still here', 63, 342);
		context.strokeStyle = 'rgba(61, 48, 37, 0.18)'; context.lineWidth = 5;
		context.beginPath(); context.moveTo(250, 148); context.lineTo(474, 156); context.stroke();
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

function makeDoorSignTexture(): THREE.CanvasTexture {
	return makeCanvasTexture(768, 240, (context) => {
		context.fillStyle = '#d6cf91'; context.fillRect(0, 0, 768, 240);
		context.strokeStyle = '#332719'; context.lineWidth = 14; context.strokeRect(12, 12, 744, 216);
		context.fillStyle = '#241c12'; context.textAlign = 'center'; context.textBaseline = 'middle';
		context.font = '800 78px monospace'; context.fillText('The Job Rooms', 384, 124);
	});
}

export function createOfficeScene(): OfficeScene {
	if (import.meta.env.DEV) assertProceduralGenerationDeterminism();
	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#29250d');
	scene.fog = new THREE.FogExp2('#70651f', 0.026);
	const disposable: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
	const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T => { disposable.push(resource); return resource; };

	const primaryWallpaper = loadRepeatingTexture(wallpaperUrl, [2.8, 1.35], track);
	const secondaryWallpaper = loadRepeatingTexture(wallpaper2Url, [2.4, 1.8], track);
	const carpetTexture = loadRepeatingTexture(carpetUrl, [18, 18], track);
	const ceilingTexture = loadRepeatingTexture(ceilingUrl, [9, 8], track);
	const woodTexture = loadRepeatingTexture(woodUrl, [1.5, 1], track);
	const wallMaterials = {
		primary: track(new THREE.MeshLambertMaterial({ map: primaryWallpaper, color: '#bbb77a' })),
		secondary: track(new THREE.MeshLambertMaterial({ map: secondaryWallpaper, color: '#969256' }))
	};
	const floorMaterial = track(new THREE.MeshLambertMaterial({ map: carpetTexture, color: '#77704a' }));
	const ceilingMaterial = track(new THREE.MeshLambertMaterial({ map: ceilingTexture, color: '#aaa77a' }));
	const fixtureMaterial = track(new THREE.MeshBasicMaterial({
		color: '#ddd79b',
		toneMapped: false
	}));

	const layoutWidth = LAYOUT_EXTENTS.maxX - LAYOUT_EXTENTS.minX;
	const layoutDepth = LAYOUT_EXTENTS.maxZ - LAYOUT_EXTENTS.minZ;
	const layoutCenterX = (LAYOUT_EXTENTS.minX + LAYOUT_EXTENTS.maxX) / 2;
	const layoutCenterZ = (LAYOUT_EXTENTS.minZ + LAYOUT_EXTENTS.maxZ) / 2;
	const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(layoutWidth, layoutDepth)), floorMaterial);
	floor.rotation.x = -Math.PI / 2; floor.position.set(layoutCenterX, 0, layoutCenterZ); floor.receiveShadow = true; scene.add(floor);
	const ceiling = new THREE.Mesh(track(new THREE.PlaneGeometry(layoutWidth, layoutDepth)), ceilingMaterial);
	ceiling.rotation.x = Math.PI / 2; ceiling.position.set(layoutCenterX, CEILING_HEIGHT, layoutCenterZ); ceiling.receiveShadow = true; scene.add(ceiling);

	const wallGeometry = track(new THREE.BoxGeometry(1, CEILING_HEIGHT, WALL_THICKNESS));
	const wallColliders: CollisionBox[] = [];
	const proceduralGraph = generateProceduralRoomGraph();
	const proceduralSpaces = [...proceduralGraph.rooms, ...proceduralGraph.hallways];
	const coreIds = new Set(ROOMS.map((space) => space.id));
	for (const spec of createOfficeWalls(
		[...ALL_SPACES, ...proceduralSpaces],
		[...OPENINGS, ...proceduralGraph.openings],
		coreIds
	)) {
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
	const doorSign = new THREE.Mesh(track(new THREE.PlaneGeometry(1.72, 0.54)), track(new THREE.MeshStandardMaterial({ map: track(makeDoorSignTexture()), roughness: 0.86 })));
	doorSign.position.set(doorWidth / 2, 2.55, 0.056); closetDoor.add(doorSign);

	const loginKiosk = new THREE.Group(); loginKiosk.position.set(1.78, 0, 7.65); loginKiosk.rotation.y = -Math.PI / 2;
	const standMaterial = track(new THREE.MeshStandardMaterial({ color: '#5b432d', roughness: 0.9 }));
	const standBase = new THREE.Mesh(track(new THREE.BoxGeometry(1.2, 0.12, 0.72)), standMaterial);
	standBase.position.y = 0.06; standBase.castShadow = true;
	const standPost = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 1.25, 0.18)), standMaterial);
	standPost.position.y = 0.68; standPost.castShadow = true;
	const clipboard = new THREE.Group(); clipboard.position.set(0, 1.42, 0.08); clipboard.rotation.x = -0.5;
	const board = new THREE.Mesh(track(new THREE.BoxGeometry(1.42, 0.92, 0.1)), standMaterial);
	board.castShadow = true;
	const sheetMaterial = track(new THREE.MeshStandardMaterial({ map: track(makeLoginTexture()), color: '#fffdf2', roughness: 1 }));
	const sheet = new THREE.Mesh(track(new THREE.PlaneGeometry(1.3, 0.76)), sheetMaterial);
	sheet.position.z = 0.051;
	const clip = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.1, 0.04)), track(new THREE.MeshStandardMaterial({ color: '#77746d', roughness: 0.4, metalness: 0.7 })));
	clip.position.set(0, 0.43, 0.075);
	clipboard.add(board, sheet, clip);
	loginKiosk.add(standBase, standPost, clipboard); scene.add(loginKiosk);

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

	scene.add(new THREE.HemisphereLight('#d8d4a2', '#343525', 1.25));
	// Low ambient fill keeps wallpaper readable between sparse procedural fixtures.
	scene.add(new THREE.AmbientLight('#d8cf8a', 0.24));
	const lights = createLightPlacements(ROOMS, WORLD_SEED).map((placement, index) => new OfficeLight({
		position: [placement.x, CEILING_HEIGHT - 0.25, placement.z],
		intensity: placement.intensity,
		range: placement.range,
		seed: placement.seed,
		fixtureLength: placement.fixtureLength,
		rotation: placement.rotation,
		castShadow: index === 2
	}));
	for (const fixture of lights) scene.add(fixture.group);
	const chunkManager = new RoomChunkManager(
		scene,
		proceduralGraph,
		{
			floor: floorMaterial,
			ceiling: ceilingMaterial,
			walls: wallMaterials,
			fixture: fixtureMaterial
		},
		{
			floor: track(new THREE.PlaneGeometry(1, 1)),
			ceiling: track(new THREE.PlaneGeometry(1, 1)),
			wall: wallGeometry,
			fixture: track(new THREE.PlaneGeometry(1, 0.5))
		}
	);

	return {
		scene,
		loginKiosk,
		jobBoard,
		jobBoardMaterial,
		closetDoor,
		worldBounds: chunkManager.bounds,
		collidesWithWall: (position, radius) => {
			const collides = (wall: CollisionBox) =>
				position.x + radius > wall.minX &&
				position.x - radius < wall.maxX &&
				position.z + radius > wall.minZ &&
				position.z - radius < wall.maxZ;
			return wallColliders.some(collides) || chunkManager.getWallColliders().some(collides);
		},
		update: (playerPosition, elapsedSeconds) => {
			lights.forEach((light) => light.update(elapsedSeconds));
			chunkManager.update(playerPosition, elapsedSeconds);
		},
		dispose: () => {
			chunkManager.dispose();
			lights.forEach((light) => light.dispose());
			disposable.forEach((resource) => resource.dispose());
		}
	};
}
