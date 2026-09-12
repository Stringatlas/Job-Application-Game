import * as THREE from 'three';
import { InteractionSystem, type ActiveInteraction } from './interactions/InteractionSystem';
import { FirstPersonController } from './player/FirstPersonController';
import { createOfficeScene } from './scene/createOfficeScene';

export interface GameWorldEvents {
	onInteractionChange: (interaction: ActiveInteraction | null) => void;
	onLoginKioskUse: () => void;
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
		this.renderer.toneMappingExposure = 0.85;
		this.renderer.domElement.className = 'game-canvas';
		this.renderer.domElement.setAttribute('aria-label', 'First-person office scene');
		this.container.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 80);
		const returningFromLogin = sessionStorage.getItem('jag:spawn') === 'login-kiosk';
		this.camera.position.set(0, 1.65, returningFromLogin ? 3.1 : 8);
		if (returningFromLogin) sessionStorage.removeItem('jag:spawn');
		this.office = createOfficeScene();
		this.interactions = new InteractionSystem(events.onInteractionChange);
		this.controller = new FirstPersonController(
			this.camera,
			this.renderer.domElement,
			{ minX: -8.4, maxX: 8.4, minZ: -11.2, maxZ: 11.2 },
			events.onPointerLockChange
		);

		this.interactions.register({
			id: 'login-kiosk',
			object: this.office.loginKiosk,
			prompt: 'E  Check in',
			maxDistance: 3.4,
			minimumFacing: 0.35,
			onFocusChange: (focused) => {
				this.office.loginScreenMaterial.emissiveIntensity = focused ? 1.15 : 0.32;
			},
			onInteract: events.onLoginKioskUse
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

	private handleInteractionKey = (event: KeyboardEvent): void => {
		if (event.code === 'KeyE' && !event.repeat && document.pointerLockElement) {
			this.interactions.interact();
		}
	};
}
