import * as THREE from 'three';

export interface OfficeScene {
	scene: THREE.Scene;
	loginKiosk: THREE.Group;
	loginScreenMaterial: THREE.MeshStandardMaterial;
	dispose: () => void;
}

function createLabelTexture(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 384;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas rendering is unavailable');

	context.fillStyle = '#0b1110';
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.strokeStyle = '#94f9c8';
	context.lineWidth = 12;
	context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
	context.fillStyle = '#94f9c8';
	context.font = '700 34px monospace';
	context.textAlign = 'center';
	context.fillText('EMPLOYEE ACCESS', canvas.width / 2, 110);
	context.font = '800 62px monospace';
	context.fillText('CHECK IN', canvas.width / 2, 210);
	context.font = '400 27px monospace';
	context.fillStyle = '#8aa99b';
	context.fillText('AUTHORIZATION REQUIRED', canvas.width / 2, 285);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

export function createOfficeScene(): OfficeScene {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color('#050607');
	scene.fog = new THREE.FogExp2('#050607', 0.035);

	const disposable: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
	const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T => {
		disposable.push(resource);
		return resource;
	};

	const floorMaterial = track(new THREE.MeshStandardMaterial({ color: '#171b1a', roughness: 0.88, metalness: 0.08 }));
	const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(18, 24, 18, 24)), floorMaterial);
	floor.rotation.x = -Math.PI / 2;
	floor.receiveShadow = true;
	scene.add(floor);

	const grid = new THREE.GridHelper(24, 24, '#27342f', '#1b2421');
	grid.position.y = 0.012;
	scene.add(grid);

	const wallMaterial = track(new THREE.MeshStandardMaterial({ color: '#202321', roughness: 0.95 }));
	const wallGeometry = track(new THREE.BoxGeometry(1, 4.5, 1));
	const addWall = (position: [number, number, number], scale: [number, number, number]) => {
		const wall = new THREE.Mesh(wallGeometry, wallMaterial);
		wall.position.set(...position);
		wall.scale.set(...scale);
		wall.receiveShadow = true;
		scene.add(wall);
	};
	addWall([-9.25, 2.25, 0], [0.5, 1, 24]);
	addWall([9.25, 2.25, 0], [0.5, 1, 24]);
	addWall([0, 2.25, -12.25], [18, 1, 0.5]);
	addWall([0, 2.25, 12.25], [18, 1, 0.5]);

	const ceiling = new THREE.Mesh(
		track(new THREE.PlaneGeometry(18, 24)),
		track(new THREE.MeshStandardMaterial({ color: '#111412', roughness: 1 }))
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.y = 4.5;
	scene.add(ceiling);

	const loginKiosk = new THREE.Group();
	const bodyMaterial = track(new THREE.MeshStandardMaterial({ color: '#242827', roughness: 0.55, metalness: 0.45 }));
	const kioskBody = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 2.2, 0.8)), bodyMaterial);
	kioskBody.position.y = 1.1;
	kioskBody.castShadow = true;
	loginKiosk.add(kioskBody);

	const loginScreenMaterial = track(
		new THREE.MeshStandardMaterial({
			map: track(createLabelTexture()),
			emissive: '#4bd59a',
			emissiveIntensity: 0.32,
			roughness: 0.25
		})
	);
	const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(1.9, 0.95)), loginScreenMaterial);
	screen.position.set(0, 1.45, 0.411);
	loginKiosk.add(screen);

	const kioskLight = new THREE.PointLight('#72ffc2', 8, 5, 2);
	kioskLight.position.set(0, 2.1, 1.2);
	loginKiosk.add(kioskLight);
	scene.add(loginKiosk);

	const deskMaterial = track(new THREE.MeshStandardMaterial({ color: '#26211c', roughness: 0.82 }));
	const deskGeometry = track(new THREE.BoxGeometry(2.8, 0.9, 1.4));
	for (const x of [-5.4, 5.4]) {
		for (const z of [-5, 4]) {
			const desk = new THREE.Mesh(deskGeometry, deskMaterial);
			desk.position.set(x, 0.45, z);
			desk.castShadow = true;
			desk.receiveShadow = true;
			scene.add(desk);
		}
	}

	scene.add(new THREE.HemisphereLight('#718d82', '#050605', 0.55));
	for (const z of [-7, 0, 7]) {
		const light = new THREE.PointLight('#d7e0d9', 14, 8, 2);
		light.position.set(z === 0 ? 4 : -4, 4.1, z);
		light.castShadow = z === 0;
		scene.add(light);
	}

	return {
		scene,
		loginKiosk,
		loginScreenMaterial,
		dispose: () => disposable.forEach((resource) => resource.dispose())
	};
}
