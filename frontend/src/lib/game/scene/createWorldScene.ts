import * as THREE from 'three';
import {
	LIGHT_PRESETS,
	WALL_THICKNESS,
	WORLD_MAP,
	deriveAirwalls,
	deriveBounds,
	furniturePresetsFor,
	type Airwall,
	type DoorSpec,
	type LampPreset,
	type PlayerBounds,
	type WallSegment
} from '../rooms/world-map';

export interface DoorHandle {
	id: string;
	leaf: THREE.Group;
	open: boolean;
	locked: boolean;
	progress: number;
	/** 关闭时阻挡门洞的门型空气墙 */
	blocker?: Airwall;
	toggleBlocked(blocked: boolean): void;
}

export interface WorldScene {
	scene: THREE.Scene;
	loginKiosk: THREE.Group;
	loginScreenMaterial: THREE.MeshStandardMaterial;
	jobBoard: THREE.Group;
	jobBoardMaterial: THREE.MeshStandardMaterial;
	doors: Record<string, DoorHandle>;
	airwalls: Airwall[];
	playerBounds: PlayerBounds;
	dispose: () => void;
}

function makeCanvasTexture(
	width: number,
	height: number,
	draw: (context: CanvasRenderingContext2D) => void
): THREE.CanvasTexture {
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

function makeCarpetTexture(): THREE.CanvasTexture {
	const texture = makeCanvasTexture(256, 256, (context) => {
		context.fillStyle = '#5c5738';
		context.fillRect(0, 0, 256, 256);
		for (let index = 0; index < 1800; index += 1) {
			const shade = 58 + Math.floor(Math.random() * 35);
			context.fillStyle = `rgb(${shade + 22}, ${shade + 18}, ${shade})`;
			context.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
		}
		context.fillStyle = 'rgba(55, 49, 24, .24)';
		context.beginPath();
		context.arc(62, 170, 39, 0, Math.PI * 2);
		context.fill();
	});
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(5, 7);
	return texture;
}

function makeRoomFloorTexture(color: string, width: number, depth: number): THREE.CanvasTexture {
	const texture = makeCanvasTexture(256, 256, (context) => {
		context.fillStyle = color;
		context.fillRect(0, 0, 256, 256);
		for (let index = 0; index < 500; index += 1) {
			context.fillStyle = `rgba(60, 56, 36, ${0.25 + (Math.random() * 0.3 + 0.02)})`;
			context.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
		}
	});
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(width / 2, depth / 2);
	return texture;
}

function makeLoginTexture(): THREE.CanvasTexture {
	return makeCanvasTexture(768, 384, (context) => {
		context.fillStyle = '#11120b';
		context.fillRect(0, 0, 768, 384);
		context.strokeStyle = '#d8d38b';
		context.lineWidth = 10;
		context.strokeRect(22, 22, 724, 340);
		context.fillStyle = '#e5e1a0';
		context.textAlign = 'center';
		context.font = '700 33px monospace';
		context.fillText('PERSONNEL TERMINAL', 384, 105);
		context.font = '800 60px monospace';
		context.fillText('SIGN IN', 384, 215);
		context.fillStyle = '#8f8d62';
		context.font = '400 25px monospace';
		context.fillText('EXIT REMAINS LOCKED', 384, 292);
	});
}

function makeBoardTexture(): THREE.CanvasTexture {
	return makeCanvasTexture(1024, 640, (context) => {
		context.fillStyle = '#6d4d2f';
		context.fillRect(0, 0, 1024, 640);
		context.fillStyle = '#241c12';
		context.fillRect(32, 28, 960, 92);
		context.fillStyle = '#d6cf91';
		context.textAlign = 'center';
		context.font = '800 58px monospace';
		context.fillText('JOB BOARD', 512, 92);
		for (let index = 0; index < 8; index += 1) {
			const column = index % 4;
			const row = Math.floor(index / 4);
			const x = 54 + column * 239;
			const y = 158 + row * 218;
			context.fillStyle = index % 3 === 0 ? '#d8d1a2' : '#c9c7ae';
			context.fillRect(x, y, 198, 174);
			context.fillStyle = '#565442';
			context.fillRect(x + 20, y + 28, 132, 11);
			context.fillRect(x + 20, y + 55, 158, 7);
			context.fillRect(x + 20, y + 76, 112, 7);
			context.fillRect(x + 20, y + 126, 72, 7);
		}
	});
}

/** 为「带门洞的墙段」构造门板组（门框、门板、拉手），位置全部由数据推算。 */
function buildDoorGroup(
	scene: THREE.Scene,
	wall: WallSegment,
	door: DoorSpec,
	track: <T extends THREE.BufferGeometry | THREE.Material>(resource: T) => T
): THREE.Group {
	const group = new THREE.Group();
	const alongZ = wall.axis === 'z';
	const start = door.center - door.width / 2;
	const end = door.center + door.width / 2;

	group.position.set(alongZ ? wall.at : start, 0, alongZ ? start : wall.at);

	const doorMaterial = track(
		new THREE.MeshStandardMaterial({ color: '#4f4a2f', roughness: 0.6, metalness: 0.12 })
	);
	let leafGeometry: THREE.BoxGeometry;
if (alongZ) {
    // Door oriented along Z axis, hinge at the start (positive Z side of opening)
    leafGeometry = new THREE.BoxGeometry(0.14, 3.7, door.width);
    // Move geometry so its local origin is at the hinge (positive Z edge)
    leafGeometry.translate(0, 0, door.width / 2);
} else {
    // Door oriented along X axis, hinge at the start (positive X side)
    leafGeometry = new THREE.BoxGeometry(door.width, 3.7, 0.14);
    leafGeometry.translate(door.width / 2, 0, 0);
}
const leaf = new THREE.Mesh(leafGeometry, doorMaterial);
leaf.position.set(0, 1.85, 0);
leaf.castShadow = true;
group.add(leaf);

	const handle = new THREE.Mesh(
		new THREE.SphereGeometry(0.07, 12, 8),
		new THREE.MeshStandardMaterial({ color: '#252319', metalness: 0.75, roughness: 0.3 })
	);
	if (alongZ) handle.position.set(-0.18, 1.8, door.width - 0.15);
	else handle.position.set(door.width - 0.14, 1.8, -0.18);
	group.add(handle);

	const postGeometry = track(
		new THREE.BoxGeometry(alongZ ? 0.22 : 0.55, 4.2, alongZ ? 0.55 : 0.22)
	);
	for (const edge of [start, end]) {
		const post = new THREE.Mesh(postGeometry, doorMaterial);
		post.position.set(alongZ ? wall.at : edge, 2.1, alongZ ? edge : wall.at);
		post.receiveShadow = true;
		group.add(post);
	}

	scene.add(group);
	return group;
}

export function createWorldScene(): WorldScene {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#17160d');
	scene.fog = new THREE.FogExp2('#292817', 0.045);

	const disposable: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
	const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T => {
		disposable.push(resource);
		return resource;
	};

	const wallGeometry = track(new THREE.BoxGeometry(1, 4.2, 1));

	for (const wall of WORLD_MAP.walls) {
		const material = track(
			new THREE.MeshStandardMaterial({ color: wall.color ?? '#9c965d', roughness: 0.96, metalness: 0 })
		);
		const [a, b] = wall.range;
		const d0 = wall.door?.width ?? 0;
		const center = wall.door?.center ?? 0;
		const spans: Array<[number, number]> =
			d0 > 0 ? [[a, center - d0 / 2], [center + d0 / 2, b]] : [[a, b]];
		for (const [from, to] of spans) {
			if (to - from <= 0.001) continue;
			const wallMesh = new THREE.Mesh(wallGeometry, material);
			if (wall.axis === 'z') {
				wallMesh.position.set(wall.at, 2.1, (from + to) / 2);
				wallMesh.scale.set(WALL_THICKNESS, 1, to - from);
			} else {
				wallMesh.position.set((from + to) / 2, 2.1, wall.at);
				wallMesh.scale.set(to - from, 1, WALL_THICKNESS);
			}
			wallMesh.receiveShadow = true;
			scene.add(wallMesh);
		}
	}

	for (const room of WORLD_MAP.rooms) {
		const width = room.bounds.xMax - room.bounds.xMin;
		const depth = room.bounds.zMax - room.bounds.zMin;
		const centerX = (room.bounds.xMin + room.bounds.xMax) / 2;
		const centerZ = (room.bounds.zMin + room.bounds.zMax) / 2;

		const floor = new THREE.Mesh(
			track(new THREE.PlaneGeometry(width, depth)),
			track(
				new THREE.MeshStandardMaterial({
					map: track(
						room.id === 'lobby'
							? makeCarpetTexture()
							: makeRoomFloorTexture(room.floorColor, width, depth)
					),
					roughness: 1
				})
			)
		);
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(centerX, 0, centerZ);
		floor.receiveShadow = true;
		scene.add(floor);

		const ceiling = new THREE.Mesh(
			track(new THREE.PlaneGeometry(width, depth)),
			track(new THREE.MeshStandardMaterial({ color: room.ceilingColor, roughness: 1 }))
		);
		ceiling.rotation.x = Math.PI / 2;
		ceiling.position.set(centerX, 4.2, centerZ);
		ceiling.receiveShadow = true;
		scene.add(ceiling);
	}

	const addLamp = (lamp: LampPreset): void => {
		const color = lamp.color ?? '#d8d486';
		const panel = new THREE.Mesh(
			track(new THREE.PlaneGeometry(2.4, 0.5)),
			track(
				new THREE.MeshStandardMaterial({
					color: '#e2dda0',
					emissive: '#e2dda0',
					emissiveIntensity: Math.min(6, lamp.intensity * 0.55),
					roughness: 0.9
				})
			)
		);
		panel.rotation.x = Math.PI / 2;
		panel.position.set(lamp.x, 4.185, lamp.z);
		panel.renderOrder = 1;
		scene.add(panel);

		const light = new THREE.PointLight(color, lamp.intensity, 13, 1.2);
		light.position.set(lamp.x, 3.9, lamp.z);
		light.castShadow = lamp.castShadow ?? false;
		scene.add(light);
	};
	for (const room of WORLD_MAP.rooms) {
		for (const lamp of LIGHT_PRESETS[room.lightPreset].lamps) addLamp(lamp);
	}
	scene.add(new THREE.HemisphereLight('#a39e69', '#1b1a0f', 0.7));

	// 大厅家具：登入终端、求职板、办公桌与显示器（沿用既有布局）
	const loginKiosk = new THREE.Group();
	loginKiosk.position.set(2.14, 0, 7.65);
	loginKiosk.rotation.y = -Math.PI / 2;
	const kioskBody = new THREE.Mesh(
		track(new THREE.BoxGeometry(1.6, 2.15, 0.55)),
		track(new THREE.MeshStandardMaterial({ color: '#302f24', roughness: 0.55, metalness: 0.35 }))
	);
	kioskBody.position.y = 1.08;
	kioskBody.castShadow = true;
	loginKiosk.add(kioskBody);
	const loginScreenMaterial = track(
		new THREE.MeshStandardMaterial({
			map: track(makeLoginTexture()),
			emissive: '#c8c66f',
			emissiveIntensity: 0.48,
			roughness: 0.3
		})
	);
	const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(1.3, 0.74)), loginScreenMaterial);
	screen.position.set(0, 1.38, 0.281);
	loginKiosk.add(screen);
	scene.add(loginKiosk);

	const boardBacking = new THREE.Mesh(
		track(new THREE.BoxGeometry(5.6, 3.25, 0.24)),
		track(new THREE.MeshStandardMaterial({ color: '#332719', roughness: 0.82 }))
	);
	boardBacking.castShadow = true;
	const jobBoard = new THREE.Group();
	jobBoard.position.set(-2.1, 2.15, -9.16);
	jobBoard.add(boardBacking);
	const jobBoardMaterial = track(
		new THREE.MeshStandardMaterial({
			map: track(makeBoardTexture()),
			emissive: '#7a7040',
			emissiveIntensity: 0.08,
			roughness: 0.88
		})
	);
	const boardFace = new THREE.Mesh(track(new THREE.PlaneGeometry(5.3, 2.95)), jobBoardMaterial);
	boardFace.position.z = 0.126;
	jobBoard.add(boardFace);
	scene.add(jobBoard);

	const deskMaterial = track(new THREE.MeshStandardMaterial({ color: '#423723', roughness: 0.82 }));
	const desktop = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.16, 1.65)), deskMaterial);
	desktop.position.set(3.1, 1.02, -2.4);
	desktop.castShadow = true;
	scene.add(desktop);
	for (const x of [1.62, 4.58]) {
		const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 1, 1.35)), deskMaterial);
		leg.position.set(x, 0.5, -2.4);
		scene.add(leg);
	}
	const monitor = new THREE.Mesh(
		track(new THREE.BoxGeometry(1.25, 0.85, 0.18)),
		track(new THREE.MeshStandardMaterial({ color: '#171710', roughness: 0.55 }))
	);
	monitor.position.set(3.1, 1.56, -2.62);
	monitor.castShadow = true;
	scene.add(monitor);

	// 面试间家具：会议桌 + 两把椅子
	const interviewTable = new THREE.Mesh(
		track(new THREE.BoxGeometry(2.8, 0.7, 1.3)),
		track(new THREE.MeshStandardMaterial({ color: '#58513a', roughness: 0.8 }))
	);
	interviewTable.position.set(11.6, 0.9, 8.3);
	interviewTable.castShadow = true;
	scene.add(interviewTable);
	for (const x of [10.7, 12.5]) {
		const chair = new THREE.Mesh(
			track(new THREE.BoxGeometry(0.55, 0.9, 0.55)),
			track(new THREE.MeshStandardMaterial({ color: '#4a4332', roughness: 0.85 }))
		);
		chair.position.set(x, 0.45, 8.3);
		chair.castShadow = true;
		scene.add(chair);
	}

	// 门：等模型组与空气墙（由同一份 map 数据构造，永远不会不同步）
	const airwalls = deriveAirwalls(WORLD_MAP.walls, furniturePresetsFor(WORLD_MAP.rooms));
	const doors: Record<string, DoorHandle> = {};
	for (const wall of WORLD_MAP.walls) {
		if (!wall.door) continue;
		const handle: DoorHandle = {
			id: wall.door.id,
			leaf: buildDoorGroup(scene, wall, wall.door, track),
			open: false,
			locked: wall.door.lock === 'pass',
			progress: 0,
			toggleBlocked(blocked) {
				if (handle.blocker) handle.blocker.active = blocked;
			}
		};
		doors[wall.door.id] = handle;
	}
	for (const airwall of airwalls) {
		const handle = airwall.door ? doors[airwall.door] : undefined;
		if (airwall.kind === 'door' && handle) {
			handle.blocker = airwall;
			airwall.active = !handle.open;
		}
	}

	return {
		scene,
		loginKiosk,
		loginScreenMaterial,
		jobBoard,
		jobBoardMaterial,
		doors,
		airwalls,
		playerBounds: deriveBounds(WORLD_MAP.walls),
		dispose: () => disposable.forEach((resource) => resource.dispose())
	};
}
