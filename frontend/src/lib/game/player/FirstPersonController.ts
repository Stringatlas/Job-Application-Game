import * as THREE from 'three';
import footstep01 from '../assets/audio/footsteps/footstep_01.wav';
import footstep02 from '../assets/audio/footsteps/footstep_02.wav';
import footstep03 from '../assets/audio/footsteps/footstep_03.wav';
import footstep04 from '../assets/audio/footsteps/footstep_04.wav';
import footstep05 from '../assets/audio/footsteps/footstep_05.wav';
import footstep06 from '../assets/audio/footsteps/footstep_06.wav';
import footstep07 from '../assets/audio/footsteps/footstep_07.wav';
import footstep08 from '../assets/audio/footsteps/footstep_08.wav';
import footstep09 from '../assets/audio/footsteps/footstep_09.wav';
import footstep10 from '../assets/audio/footsteps/footstep_10.wav';
import footstep11 from '../assets/audio/footsteps/footstep_11.wav';

const FOOTSTEP_DISTANCE = 1.05;
const MIN_FOOTSTEP_PLAYBACK_RATE = 0.92;
const MAX_FOOTSTEP_PLAYBACK_RATE = 1.08;
const FOOTSTEP_SOURCES = [
	footstep01,
	footstep02,
	footstep03,
	footstep04,
	footstep05,
	footstep06,
	footstep07,
	footstep08,
	footstep09,
	footstep10,
	footstep11
];

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
	private verticalVelocity = 0;
	private grounded = true;
	private readonly footsteps = FOOTSTEP_SOURCES.map((source) => {
		const audio = new Audio(source);
		audio.preload = 'auto';
		audio.volume = 0.32;
		audio.preservesPitch = false;
		return audio;
	});
	private lastFootstep = -1;
	private distanceSinceFootstep = 0;
	private walking = false;

	constructor(
		private readonly camera: THREE.PerspectiveCamera,
		private readonly element: HTMLElement,
		private readonly bounds: PlayerBounds,
		private readonly onLockChange: (locked: boolean) => void,
		private readonly canOccupy: (position: THREE.Vector3) => boolean = () => true
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
		this.walking = false;
		this.distanceSinceFootstep = 0;
		if (!enabled && document.pointerLockElement === this.element) document.exitPointerLock();
	}

	update(deltaSeconds: number): void {
		if (!this.enabled || document.pointerLockElement !== this.element) return;

		const horizontal = Number(this.pressed.has('KeyD')) - Number(this.pressed.has('KeyA'));
		const vertical = Number(this.pressed.has('KeyW')) - Number(this.pressed.has('KeyS'));
		const delta = Math.min(deltaSeconds, 0.05);
		const startX = this.camera.position.x;
		const startZ = this.camera.position.z;

		if (horizontal !== 0 || vertical !== 0) {
			this.camera.getWorldDirection(this.forward);
			this.forward.y = 0;
			this.forward.normalize();
			this.right.crossVectors(this.forward, this.camera.up).normalize();
			this.movement
				.set(0, 0, 0)
				.addScaledVector(this.forward, vertical)
				.addScaledVector(this.right, horizontal)
				.normalize();

			const sprinting =
				this.pressed.has('ControlLeft') ||
				this.pressed.has('ControlRight') ||
				this.pressed.has('ShiftLeft');
			const speed = sprinting ? 5.4 : 3.4;
			const distance = speed * delta;
			const candidate = this.camera.position.clone();
			candidate.x = THREE.MathUtils.clamp(
				candidate.x + this.movement.x * distance,
				this.bounds.minX,
				this.bounds.maxX
			);
			if (this.canOccupy(candidate)) this.camera.position.x = candidate.x;

			candidate.copy(this.camera.position);
			candidate.z = THREE.MathUtils.clamp(
				candidate.z + this.movement.z * distance,
				this.bounds.minZ,
				this.bounds.maxZ
			);
			if (this.canOccupy(candidate)) this.camera.position.z = candidate.z;
		}

		this.verticalVelocity -= 18 * delta;
		this.camera.position.y += this.verticalVelocity * delta;
		if (this.camera.position.y <= this.eyeHeight) {
			this.camera.position.y = this.eyeHeight;
			this.verticalVelocity = 0;
			this.grounded = true;
		}

		const distanceMoved = Math.hypot(
			this.camera.position.x - startX,
			this.camera.position.z - startZ
		);
		this.updateFootsteps(distanceMoved);
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);
		document.removeEventListener('mousemove', this.handleMouseMove);
		document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
		for (const footstep of this.footsteps) {
			footstep.pause();
			footstep.removeAttribute('src');
			footstep.load();
		}
		if (document.pointerLockElement === this.element) document.exitPointerLock();
	}

	private updateFootsteps(distanceMoved: number): void {
		const isWalking = this.grounded && distanceMoved > 0.0001;
		if (!isWalking) {
			this.walking = false;
			this.distanceSinceFootstep = 0;
			return;
		}

		if (!this.walking) {
			this.playRandomFootstep();
			this.walking = true;
		}

		this.distanceSinceFootstep += distanceMoved;
		if (this.distanceSinceFootstep >= FOOTSTEP_DISTANCE) {
			this.distanceSinceFootstep %= FOOTSTEP_DISTANCE;
			this.playRandomFootstep();
		}
	}

	private playRandomFootstep(): void {
		let index = Math.floor(Math.random() * this.footsteps.length);
		if (index === this.lastFootstep) {
			index = (index + 1 + Math.floor(Math.random() * (this.footsteps.length - 1))) % this.footsteps.length;
		}

		this.lastFootstep = index;
		const footstep = this.footsteps[index];
		footstep.playbackRate = THREE.MathUtils.randFloat(
			MIN_FOOTSTEP_PLAYBACK_RATE,
			MAX_FOOTSTEP_PLAYBACK_RATE
		);
		footstep.currentTime = 0;
		void footstep.play().catch(() => {
			// Browsers may reject audio until the first user gesture; the next step retries.
		});
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.enabled) return;
		this.pressed.add(event.code);
		if (event.code === 'Space' && !event.repeat && this.grounded) {
			this.verticalVelocity = 6.2;
			this.grounded = false;
		}
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
