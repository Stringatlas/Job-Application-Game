import * as THREE from 'three';
import { InteractionSystem, type ActiveInteraction } from './interactions/InteractionSystem';
import { FirstPersonController } from './player/FirstPersonController';
import { createWorldScene, type DoorHandle } from './scene/createWorldScene';

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
	private readonly world: ReturnType<typeof createWorldScene>;
	private readonly clock = new THREE.Clock();
	private readonly resizeObserver: ResizeObserver;
	private animationFrame = 0;
	private disposed = false;
	private authenticated = false;

	constructor(
		private readonly container: HTMLElement,
		private readonly events: GameWorldEvents
	) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
		// 1x 渲染即可获得流畅帧率；2x(或屏幕真实 DPR)会增加 2-4 倍像素负载，集显/小机容易掉帧卡顿
		this.renderer.setPixelRatio(1);
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
		this.world = createWorldScene();
		this.interactions = new InteractionSystem(events.onInteractionChange);
		this.controller = new FirstPersonController(
			this.camera,
			this.renderer.domElement,
			this.world.playerBounds,
			events.onPointerLockChange,
			this.canOccupy
		);

		this.interactions.register({
			id: 'login-kiosk',
			object: this.world.loginKiosk,
			prompt: 'E  Check in',
			maxDistance: 3.4,
			minimumFacing: 0.35,
			onFocusChange: (focused) => {
				this.world.loginScreenMaterial.emissiveIntensity = focused ? 0.72 : 0.32;
			},
			onInteract: events.onLoginKioskUse
		});
		this.interactions.register({
			id: 'job-board',
			object: this.world.jobBoard,
			prompt: 'E  Open job board',
			maxDistance: 4.2,
			minimumFacing: 0.25,
			onFocusChange: (focused) => {
				this.world.jobBoardMaterial.emissiveIntensity = focused ? 0.24 : 0.08;
			},
			onInteract: events.onJobBoardUse
		});

		for (const door of Object.values(this.world.doors)) {
			this.interactions.register(this.makeDoorInteractable(door));
		}

		this.renderer.domElement.addEventListener('click', this.handleCanvasClick);
		window.addEventListener('keydown', this.handleInteractionKey);
		this.resizeObserver = new ResizeObserver(this.resize);
		this.resizeObserver.observe(this.container);
		this.resize();
		this.animate();
	}

	private makeDoorInteractable(door: DoorHandle) {
		return {
			id: `door-${door.id}`,
			object: door.leaf,
			prompt: this.doorPrompt(door),
			maxDistance: 3.4,
			minimumFacing: 0.2,
			onInteract: () => this.toggleDoor(door.id)
		};
	}

	private doorPrompt(door: DoorHandle): string {
		if (door.locked && !this.authenticated) return 'E Open (needs pass)';
		return door.open ? 'E Close door' : 'E Open door';
	}

	private toggleDoor(id: string): void {
		const door = this.world.doors[id];
		if (!door) return;
		if (door.locked && !this.authenticated) return;
		door.open = !door.open;
		door.toggleBlocked(!door.open);
		this.interactions.updatePrompt(`door-${id}`, this.doorPrompt(door));
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
		const interviewDoor = this.world.doors['interview'];
		if (interviewDoor) {
			this.interactions.updatePrompt(`door-interview`, this.doorPrompt(interviewDoor));
		}
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
		this.world.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	private animate = (): void => {
		if (this.disposed) return;
		this.animationFrame = requestAnimationFrame(this.animate);
		const delta = this.clock.getDelta();
		this.controller.update(delta);
		this.interactions.update(this.camera);
		for (const door of Object.values(this.world.doors)) {
			const target = door.open ? 1 : 0;
			door.progress = THREE.MathUtils.damp(door.progress, target, 6, delta);
			door.leaf.rotation.y = -door.progress * Math.PI * 0.52;
		}
		const pulse = 1 + Math.sin(this.clock.elapsedTime * 2.1) * 0.006;
		this.world.loginKiosk.scale.setScalar(pulse);
		this.renderer.render(this.world.scene, this.camera);
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
		for (const wall of this.world.airwalls) {
			if (!wall.active) continue;
			if (
				position.x >= wall.xMin &&
				position.x <= wall.xMax &&
				position.z >= wall.zMin &&
				position.z <= wall.zMax
			) {
				return false;
			}
		}
		return true;
	};

	private handleInteractionKey = (event: KeyboardEvent): void => {
		if (event.code === 'KeyE' && !event.repeat && document.pointerLockElement) {
			this.interactions.interact();
		}
	};
}
