import * as THREE from 'three';

export interface PlayerBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export class FirstPersonController {
	private readonly pressed = new Set<string>();
	private readonly forward = new THREE.Vector3();
	private readonly right = new THREE.Vector3();
	private readonly movement = new THREE.Vector3();
	private yaw = 0;
	private pitch = 0;
	private enabled = true;
	private readonly eyeHeight = 1.65;

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly element: HTMLElement,
		private readonly bounds: PlayerBounds,
		private readonly onLockChange: (locked: boolean) => void
	) {
		this.camera.rotation.order = 'YXZ';
		window.addEventListener('keydown', this.handleKeyDown);
		window.addEventListener('keyup', this.handleKeyUp);
		document.addEventListener('mousemove', this.handleMouseMove);
		document.addEventListener('pointerlockchange', this.handlePointerLockChange);
	}

	requestPointerLock(): void {
		if (this.enabled && document.pointerLockElement !== this.element) {
			void this.element.requestPointerLock();
		}
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		this.pressed.clear();
		if (!enabled && document.pointerLockElement === this.element) document.exitPointerLock();
	}

	update(deltaSeconds: number): void {
		if (!this.enabled || document.pointerLockElement !== this.element) return;

		const horizontal = Number(this.pressed.has('KeyD')) - Number(this.pressed.has('KeyA'));
		const vertical = Number(this.pressed.has('KeyW')) - Number(this.pressed.has('KeyS'));
		if (horizontal === 0 && vertical === 0) return;

		this.camera.getWorldDirection(this.forward);
		this.forward.y = 0;
		this.forward.normalize();
		this.right.crossVectors(this.forward, this.camera.up).normalize();
		this.movement
			.set(0, 0, 0)
			.addScaledVector(this.forward, vertical)
			.addScaledVector(this.right, horizontal)
			.normalize();

		const speed = this.pressed.has('ShiftLeft') ? 5.4 : 3.4;
		this.camera.position.addScaledVector(this.movement, speed * Math.min(deltaSeconds, 0.05));
		this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, this.bounds.minX, this.bounds.maxX);
		this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, this.bounds.minZ, this.bounds.maxZ);
		this.camera.position.y = this.eyeHeight;
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);
		document.removeEventListener('mousemove', this.handleMouseMove);
		document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
		if (document.pointerLockElement === this.element) document.exitPointerLock();
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (this.enabled) this.pressed.add(event.code);
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		this.pressed.delete(event.code);
	};

	private handleMouseMove = (event: MouseEvent): void => {
		if (!this.enabled || document.pointerLockElement !== this.element) return;
		this.yaw -= event.movementX * 0.0022;
		this.pitch -= event.movementY * 0.0022;
		this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2.1, Math.PI / 2.1);
		this.camera.rotation.set(this.pitch, this.yaw, 0);
	};

	private handlePointerLockChange = (): void => {
		this.onLockChange(document.pointerLockElement === this.element);
	};
}
