import * as THREE from 'three';

export interface OfficeScene {
	scene: THREE.Scene;
	loginKiosk: THREE.Group;
	loginScreenMaterial: THREE.MeshStandardMaterial;
	jobBoard: THREE.Group;
	jobBoardMaterial: THREE.MeshStandardMaterial;
	closetDoor: THREE.Group;
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

export function createOfficeScene(): OfficeScene {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#17160d');
	scene.fog = new THREE.FogExp2('#292817', 0.045);

	const disposable: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
	const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T => {
		disposable.push(resource);
		return resource;
	};
	const wallMaterial = track(
		new THREE.MeshStandardMaterial({ color: '#9c965d', roughness: 0.96, metalness: 0 })
	);
	const darkWallMaterial = track(
		new THREE.MeshStandardMaterial({ color: '#504d31', roughness: 0.98 })
	);
	const wallGeometry = track(new THREE.BoxGeometry(1, 4.2, 1));
	const addWall = (
		position: [number, number, number],
		scale: [number, number, number],
		material = wallMaterial
	): THREE.Mesh => {
		const wall = new THREE.Mesh(wallGeometry, material);
		wall.position.set(...position);
		wall.scale.set(...scale);
		wall.receiveShadow = true;
		scene.add(wall);
		return wall;
	};

	const floor = new THREE.Mesh(
		track(new THREE.PlaneGeometry(14, 19)),
		track(new THREE.MeshStandardMaterial({ map: track(makeCarpetTexture()), roughness: 1 }))
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.z = 0.25;
	floor.receiveShadow = true;
	scene.add(floor);

	const ceiling = new THREE.Mesh(
		track(new THREE.PlaneGeometry(14, 19)),
		track(new THREE.MeshStandardMaterial({ color: '#8a865c', roughness: 1 }))
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.set(0, 4.2, 0.25);
	ceiling.receiveShadow = true;
	scene.add(ceiling);

	addWall([-7.25, 2.1, 0.25], [0.5, 1, 19]);
	addWall([7.25, 2.1, 0.25], [0.5, 1, 19]);
	addWall([0, 2.1, -9.5], [14, 1, 0.5]);
	addWall([0, 2.1, 10], [14, 1, 0.5]);
	addWall([-4.05, 2.1, 5.15], [5.9, 1, 0.3], darkWallMaterial);
	addWall([4.05, 2.1, 5.15], [5.9, 1, 0.3], darkWallMaterial);
	addWall([-2.4, 2.1, 7.55], [0.3, 1, 4.8], darkWallMaterial);
	addWall([2.4, 2.1, 7.55], [0.3, 1, 4.8], darkWallMaterial);

	const closetDoor = new THREE.Group();
	closetDoor.position.set(-0.92, 0, 5.32);
	const door = new THREE.Mesh(
		track(new THREE.BoxGeometry(1.84, 3.7, 0.14)),
		track(new THREE.MeshStandardMaterial({ color: '#66613d', roughness: 0.72, metalness: 0.16 }))
	);
	door.position.set(0.92, 1.85, 0);
	door.castShadow = true;
	closetDoor.add(door);
	const handle = new THREE.Mesh(
		track(new THREE.SphereGeometry(0.07, 12, 8)),
		track(new THREE.MeshStandardMaterial({ color: '#252319', metalness: 0.75, roughness: 0.3 }))
	);
	handle.position.set(1.62, 1.8, 0.11);
	closetDoor.add(handle);
	scene.add(closetDoor);

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

	const jobBoard = new THREE.Group();
	jobBoard.position.set(-2.1, 2.15, -9.16);
	const boardBacking = new THREE.Mesh(
		track(new THREE.BoxGeometry(5.6, 3.25, 0.24)),
		track(new THREE.MeshStandardMaterial({ color: '#332719', roughness: 0.82 }))
	);
	boardBacking.castShadow = true;
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

	scene.add(new THREE.HemisphereLight('#a39e69', '#1b1a0f', 0.7));
	const panelMaterial = track(
		new THREE.MeshBasicMaterial({ color: '#e2dda0', transparent: true, opacity: 0.78 })
	);
	for (const [x, z, intensity] of [
		[-3.5, -5.8, 10],
		[3.2, -0.4, 7],
		[-2.8, 3.2, 9],
		[0, 7.5, 5]
	] as const) {
		const panel = new THREE.Mesh(track(new THREE.PlaneGeometry(2.7, 0.55)), panelMaterial);
		panel.rotation.x = Math.PI / 2;
		panel.position.set(x, 4.185, z);
		scene.add(panel);
		const light = new THREE.PointLight('#d8d486', intensity, 7, 2.1);
		light.position.set(x, 3.95, z);
		light.castShadow = z === -0.4;
		scene.add(light);
	}

	return {
		scene,
		loginKiosk,
		loginScreenMaterial,
		jobBoard,
		jobBoardMaterial,
		closetDoor,
		dispose: () => disposable.forEach((resource) => resource.dispose())
	};
}
