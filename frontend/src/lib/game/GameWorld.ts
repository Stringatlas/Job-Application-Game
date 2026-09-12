import * as THREE from 'three';
import { InteractionSystem, type ActiveInteraction } from './interactions/InteractionSystem';
import { FirstPersonController } from './player/FirstPersonController';
import { createOfficeScene } from './scene/createOfficeScene';
import type { PlayerState, Vector3State } from './multiplayer/types';

interface RemoteAvatar {
	group: THREE.Group;
	targetPosition: THREE.Vector3;
	targetRotation: number;
}

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
	private readonly remoteAvatars = new Map<string, RemoteAvatar>();

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

	getLocalTransform(): { position: Vector3State; rotation: number } {
		return {
			position: {
				x: Number(this.camera.position.x.toFixed(3)),
				y: Number(this.camera.position.y.toFixed(3)),
				z: Number(this.camera.position.z.toFixed(3))
			},
			rotation: Number(THREE.MathUtils.euclideanModulo(this.camera.rotation.y + Math.PI, Math.PI * 2).toFixed(3)) - Math.PI
		};
	}

	setRemotePlayers(players: PlayerState[], selfId: string | null): void {
		const remoteIds = new Set(players.filter((player) => player.id !== selfId).map((player) => player.id));
		for (const [id, avatar] of this.remoteAvatars) {
			if (!remoteIds.has(id)) {
				this.office.scene.remove(avatar.group);
				avatar.group.traverse((object) => {
					if (object instanceof THREE.Mesh) {
						object.geometry.dispose();
						const materials = Array.isArray(object.material) ? object.material : [object.material];
						materials.forEach((material) => material.dispose());
					} else if (object instanceof THREE.Sprite) {
						object.material.map?.dispose();
						object.material.dispose();
					}
				});
				this.remoteAvatars.delete(id);
			}
		}

		for (const player of players) {
			if (player.id === selfId) continue;
			let avatar = this.remoteAvatars.get(player.id);
			if (!avatar) {
				const group = this.createRemoteAvatar(player.id, player.username);
				group.position.set(player.position.x, 0, player.position.z);
				group.rotation.y = player.rotation;
				this.office.scene.add(group);
				avatar = {
					group,
					targetPosition: new THREE.Vector3(player.position.x, 0, player.position.z),
					targetRotation: player.rotation
				};
				this.remoteAvatars.set(player.id, avatar);
			}
			avatar.targetPosition.set(player.position.x, Math.max(0, player.position.y - 1.65), player.position.z);
			avatar.targetRotation = player.rotation;
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
		this.setRemotePlayers([], null);
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
		for (const avatar of this.remoteAvatars.values()) {
			avatar.group.position.lerp(avatar.targetPosition, 1 - Math.exp(-12 * delta));
			avatar.group.rotation.y = THREE.MathUtils.damp(
				avatar.group.rotation.y,
				avatar.targetRotation,
				12,
				delta
			);
		}
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

	private createRemoteAvatar(id: string, username: string): THREE.Group {
		const hue = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
		const material = new THREE.MeshStandardMaterial({
			color: new THREE.Color(`hsl(${hue}, 48%, 45%)`),
			roughness: 0.82
		});
		const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x24271f, roughness: 0.9 });
		const group = new THREE.Group();
		const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.74, 4, 8), material);
		body.position.y = 0.84;
		body.castShadow = true;
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), material.clone());
		head.position.y = 1.62;
		head.castShadow = true;
		const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), darkMaterial);
		visor.position.set(0, 1.65, -0.21);
		const nameLabel = this.createUsernameLabel(username);
		nameLabel.position.y = 2.15;
		group.add(body, head, visor, nameLabel);
		return group;
	}

	private createUsernameLabel(username: string): THREE.Sprite {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 128;
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Unable to create username label');
		}

		let fontSize = 64;
		context.font = `600 ${fontSize}px system-ui, sans-serif`;
		while (context.measureText(username).width > canvas.width - 64 && fontSize > 30) {
			fontSize -= 2;
			context.font = `600 ${fontSize}px system-ui, sans-serif`;
		}
		context.fillStyle = '#f5f7ef';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText(username, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 64);

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.minFilter = THREE.LinearFilter;
		const label = new THREE.Sprite(
			new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
		);
		label.scale.set(1.6, 0.4, 1);
		label.center.set(0.5, 0);
		return label;
	}
}
