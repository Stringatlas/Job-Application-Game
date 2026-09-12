import * as THREE from 'three';
import { InteractionSystem, type ActiveInteraction } from './interactions/InteractionSystem';
import { FirstPersonController } from './player/FirstPersonController';
import { createOfficeScene } from './scene/createOfficeScene';

export interface GameWorldEvents {
	onInteractionChange: (interaction: ActiveInteraction | null) => void;
	onLoginKioskUse: () => void;
	onJobBoardUse: () => void;
	onPointerLockChange: (locked: boolean) => void;
}

export class GameWorld {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly controller: FirstPersonController;
	private readonly interactions: InteractionSystem;
	private readonly office: ReturnType<typeof createOfficeScene>;
	private readonly clock = new THREE.Clock();
	private readonly resizeObserver: ResizeObserver;
	private animationFrame = 0;
	private disposed = false;
	private authenticated = false;
	private doorOpenProgress = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly events: GameWorldEvents
	) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.1;
		this.renderer.domElement.className = 'game-canvas';
		this.renderer.domElement.setAttribute('aria-label', 'First-person office scene');
		this.container.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 80);
		this.camera.position.set(0, 1.65, 8.15);
		sessionStorage.removeItem('jag:spawn');
		this.office = createOfficeScene();
		this.interactions = new InteractionSystem(events.onInteractionChange);
		this.controller = new FirstPersonController(
			this.camera,
			this.renderer.domElement,
			{ minX: -6.75, maxX: 6.75, minZ: -9, maxZ: 9.5 },
			events.onPointerLockChange,
			this.canOccupy
		);

		this.interactions.register({
			id: 'login-kiosk',
			object: this.office.loginKiosk,
			prompt: 'E  Check in',
			maxDistance: 3.4,
			minimumFacing: 0.35,
			onFocusChange: (focused) => {
				this.office.loginScreenMaterial.emissiveIntensity = focused ? 0.72 : 0.32;
			},
			onInteract: events.onLoginKioskUse
		});
		this.interactions.register({
			id: 'job-board',
			object: this.office.jobBoard,
			prompt: 'E  Open job board',
			maxDistance: 4.2,
			minimumFacing: 0.25,
			onFocusChange: (focused) => {
				this.office.jobBoardMaterial.emissiveIntensity = focused ? 0.24 : 0.08;
			},
			onInteract: events.onJobBoardUse
		});

		this.renderer.domElement.addEventListener('click', this.handleCanvasClick);
		window.addEventListener('keydown', this.handleInteractionKey);
		this.resizeObserver = new ResizeObserver(this.resize);
		this.resizeObserver.observe(this.container);
		this.resize();
		this.animate();
	}

	requestPointerLock(): void {
		this.controller.requestPointerLock();
	}

	setPaused(paused: boolean): void {
		this.controller.setEnabled(!paused);
	}

	setAuthenticated(authenticated: boolean): void {
		this.authenticated = authenticated;
		this.interactions.updatePrompt('login-kiosk', authenticated ? 'E  View player pass' : 'E  Check in');
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		cancelAnimationFrame(this.animationFrame);
		this.resizeObserver.disconnect();
		window.removeEventListener('keydown', this.handleInteractionKey);
		this.renderer.domElement.removeEventListener('click', this.handleCanvasClick);
		this.controller.dispose();
		this.interactions.dispose();
		this.office.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	private animate = (): void => {
		if (this.disposed) return;
		this.animationFrame = requestAnimationFrame(this.animate);
		const delta = this.clock.getDelta();
		this.controller.update(delta);
		this.interactions.update(this.camera);
		const doorTarget = this.authenticated ? 1 : 0;
		this.doorOpenProgress = THREE.MathUtils.damp(
			this.doorOpenProgress,
			doorTarget,
			4.5,
			delta
		);
		this.office.closetDoor.rotation.y = -this.doorOpenProgress * Math.PI * 0.52;
		const pulse = 1 + Math.sin(this.clock.elapsedTime * 2.1) * 0.006;
		this.office.loginKiosk.scale.setScalar(pulse);
		this.renderer.render(this.office.scene, this.camera);
	};

	private resize = (): void => {
		const width = Math.max(this.container.clientWidth, 1);
		const height = Math.max(this.container.clientHeight, 1);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height, false);
	};

	private handleCanvasClick = (): void => this.controller.requestPointerLock();

	private canOccupy = (position: THREE.Vector3): boolean => {
		if (position.z > 5.5 && Math.abs(position.x) > 2.08) return false;
		if (position.z > 4.94 && position.z < 5.52 && Math.abs(position.x) > 0.72) return false;
		if (
			this.doorOpenProgress < 0.82 &&
			position.z > 5.12 &&
			position.z < 5.52 &&
			Math.abs(position.x) <= 0.95
		) {
			return false;
		}
		const hitsDesk =
			position.x > 1.15 &&
			position.x < 5.05 &&
			position.z > -3.5 &&
			position.z < -1.3;
		return !hitsDesk;
	};

	private handleInteractionKey = (event: KeyboardEvent): void => {
		if (event.code === 'KeyE' && !event.repeat && document.pointerLockElement) {
			this.interactions.interact();
		}
	};
}
