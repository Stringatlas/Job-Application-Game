import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import suitModelUrl from '$lib/game/assets/business_suit/scene-optimized.glb?url';

const NAME = 'Mysterious Horizon';
const CHARACTER_HEIGHT = 1.8;
const HOVER_HEIGHT = 0.32;
const HOVER_AMOUNT = 0.12;
const HOVER_SPEED = 1.8;
const WALK_SPEED = 0.9;
const MAX_TURN_SPEED = 2.4;
const MIN_IDLE_SECONDS = 1.5;
const MAX_IDLE_SECONDS = 5.5;

// An irregular loop through the main room that stays clear of the central desk.
const PATROL_POINTS = [
	new THREE.Vector3(-5.5, 0, 3.4),
	new THREE.Vector3(-5.8, 0, 0.8),
	new THREE.Vector3(-4.9, 0, -2.3),
	new THREE.Vector3(-5.6, 0, -6.6),
	new THREE.Vector3(-2.4, 0, -7.9),
	new THREE.Vector3(1.1, 0, -7.2),
	new THREE.Vector3(4.8, 0, -7.8),
	new THREE.Vector3(5.7, 0, -4.8),
	new THREE.Vector3(5.35, 0, -0.25),
	new THREE.Vector3(5.6, 0, 3.2),
	new THREE.Vector3(2.7, 0, 3.8),
	new THREE.Vector3(-0.4, 0, 3.15),
	new THREE.Vector3(-3.1, 0, 4.0)
] as const;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

type NpcState =
	| { kind: 'idle'; waypointIndex: number; secondsRemaining: number }
	| { kind: 'moving'; fromWaypointIndex: number; targetWaypointIndex: number };

export class MysteriousHorizon {
	readonly group = new THREE.Group();
	private readonly floatingGroup = new THREE.Group();
	private readonly targetRotation = new THREE.Quaternion();
	private readonly travelDirection = new THREE.Vector3();
	private state: NpcState = {
		kind: 'idle',
		waypointIndex: 0,
		secondsRemaining: this.randomIdleDuration()
	};
	private movementSpeed = 0;
	private disposed = false;

	constructor(scene: THREE.Scene) {
		this.group.name = NAME;
		this.group.position.copy(PATROL_POINTS[0]);
		this.floatingGroup.add(this.createNameLabel());
		this.group.add(this.floatingGroup);
		scene.add(this.group);
		void this.loadSuit();
	}

	update(deltaSeconds: number, elapsedSeconds: number): void {
		this.floatingGroup.position.y = HOVER_HEIGHT + Math.sin(elapsedSeconds * HOVER_SPEED) * HOVER_AMOUNT;
		this.floatingGroup.rotation.z = Math.sin(elapsedSeconds * 0.7) * 0.018;

		if (this.state.kind === 'idle') {
			this.movementSpeed = THREE.MathUtils.damp(this.movementSpeed, 0, 7, deltaSeconds);
			this.state.secondsRemaining -= deltaSeconds;
			if (this.state.secondsRemaining <= 0) this.beginMoving(this.state.waypointIndex);
			return;
		}

		const target = PATROL_POINTS[this.state.targetWaypointIndex];
		this.travelDirection.subVectors(target, this.group.position);
		const distance = this.travelDirection.length();
		if (distance < 0.025) {
			this.group.position.copy(target);
			this.movementSpeed = 0;
			this.state = {
				kind: 'idle',
				waypointIndex: this.state.targetWaypointIndex,
				secondsRemaining: this.randomIdleDuration()
			};
			return;
		}

		this.travelDirection.divideScalar(distance);
		const heading = Math.atan2(this.travelDirection.x, this.travelDirection.z);
		this.targetRotation.setFromAxisAngle(UP_AXIS, heading);
		this.group.quaternion.rotateTowards(this.targetRotation, MAX_TURN_SPEED * deltaSeconds);

		// Ease into motion and slow down on approach to avoid robotic starts and stops.
		const approachFactor = THREE.MathUtils.smoothstep(distance, 0, 0.9);
		const desiredSpeed = WALK_SPEED * Math.max(0.2, approachFactor);
		this.movementSpeed = THREE.MathUtils.damp(this.movementSpeed, desiredSpeed, 4.5, deltaSeconds);
		this.group.position.addScaledVector(
			this.travelDirection,
			Math.min(distance, this.movementSpeed * deltaSeconds)
		);
	}

	private beginMoving(fromWaypointIndex: number): void {
		// Neighboring points keep every randomly chosen leg clear of walls and the desk.
		const direction = Math.random() < 0.5 ? -1 : 1;
		const targetWaypointIndex =
			(fromWaypointIndex + direction + PATROL_POINTS.length) % PATROL_POINTS.length;
		this.state = { kind: 'moving', fromWaypointIndex, targetWaypointIndex };
	}

	private randomIdleDuration(): number {
		return THREE.MathUtils.randFloat(MIN_IDLE_SECONDS, MAX_IDLE_SECONDS);
	}

	dispose(scene: THREE.Scene): void {
		if (this.disposed) return;
		this.disposed = true;
		scene.remove(this.group);
		this.disposeObject(this.group);
	}

	private async loadSuit(): Promise<void> {
		try {
			const gltf = await new GLTFLoader().loadAsync(suitModelUrl);
			const suit = gltf.scene;
			if (this.disposed) {
				this.disposeObject(suit);
				return;
			}

			suit.traverse((object) => {
				if (!(object instanceof THREE.Mesh)) return;
				// Even optimized, this model is ~52k triangles. A shadow-casting point
				// light would draw it into all six shadow-cubemap faces every frame.
				// Keep it fully rendered and lit, but out of the shadow-only passes.
				object.castShadow = false;
				object.receiveShadow = true;
				const materials = Array.isArray(object.material) ? object.material : [object.material];
				for (const material of materials) {
					if (material instanceof THREE.MeshStandardMaterial) {
						material.normalMap?.dispose();
						material.normalMap = null;
						material.flatShading = true;
						material.needsUpdate = true;
					}
				}
			});

			// Normalize the source model regardless of its original units and pivot.
			const sourceBounds = new THREE.Box3().setFromObject(suit);
			const sourceSize = sourceBounds.getSize(new THREE.Vector3());
			const scale = CHARACTER_HEIGHT / sourceSize.y;
			suit.scale.setScalar(scale);
			suit.updateMatrixWorld(true);
			const scaledBounds = new THREE.Box3().setFromObject(suit);
			const center = scaledBounds.getCenter(new THREE.Vector3());
			suit.position.set(-center.x, -scaledBounds.min.y, -center.z);
			this.floatingGroup.add(suit);
		} catch (error) {
			console.error(`Unable to load ${NAME}`, error);
		}
	}

	private createNameLabel(): THREE.Sprite {
		const canvas = document.createElement('canvas');
		canvas.width = 640;
		canvas.height = 128;
		const context = canvas.getContext('2d');
		if (!context) throw new Error(`Unable to create ${NAME} label`);

		context.font = '600 54px system-ui, sans-serif';
		context.fillStyle = '#c5a83a';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText(NAME, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 48);

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.minFilter = THREE.LinearFilter;
		const label = new THREE.Sprite(
			new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
		);
		label.name = `${NAME} name tag`;
		label.position.y = 2.1;
		label.scale.set(2.25, 0.45, 1);
		label.center.set(0.5, 0);
		return label;
	}

	private disposeObject(root: THREE.Object3D): void {
		const geometries = new Set<THREE.BufferGeometry>();
		const materials = new Set<THREE.Material>();
		const textures = new Set<THREE.Texture>();
		root.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				geometries.add(object.geometry);
				const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
				objectMaterials.forEach((material) => materials.add(material));
			} else if (object instanceof THREE.Sprite) {
				materials.add(object.material);
				if (object.material.map) textures.add(object.material.map);
			}
		});
		for (const material of materials) {
			for (const value of Object.values(material)) {
				if (value instanceof THREE.Texture) textures.add(value);
			}
			material.dispose();
		}
		textures.forEach((texture) => texture.dispose());
		geometries.forEach((geometry) => geometry.dispose());
	}
}
