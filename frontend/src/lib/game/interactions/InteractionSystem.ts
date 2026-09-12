import * as THREE from 'three';

export interface Interactable {
	id: string;
	object: THREE.Object3D;
	prompt: string;
	maxDistance?: number;
	minimumFacing?: number;
	onFocusChange?: (focused: boolean) => void;
	onInteract: () => void;
}

export interface ActiveInteraction {
	id: string;
	prompt: string;
}

export class InteractionSystem {
	private readonly interactables = new Map<string, Interactable>();
	private active: Interactable | null = null;
	private readonly stableFramesRequired = 6;
	private candidate: Interactable | null = null;
	private candidateStableFrames = 0;
	private readonly targetPosition = new THREE.Vector3();
	private readonly cameraDirection = new THREE.Vector3();
	private readonly targetDirection = new THREE.Vector3();

	constructor(private readonly onActiveChange: (active: ActiveInteraction | null) => void) {}

	register(interactable: Interactable): () => void {
		this.interactables.set(interactable.id, interactable);
		return () => this.unregister(interactable.id);
	}

	unregister(id: string): void {
		const interactable = this.interactables.get(id);
		if (this.active === interactable) this.setActive(null);
		this.interactables.delete(id);
	}

	updatePrompt(id: string, prompt: string): void {
		const interactable = this.interactables.get(id);
		if (!interactable) return;
		interactable.prompt = prompt;
		if (this.active === interactable) this.onActiveChange({ id, prompt });
	}

	update(camera: THREE.Camera): void {
		camera.getWorldDirection(this.cameraDirection);
		let closest: Interactable | null = null;
		let closestDistance = Number.POSITIVE_INFINITY;

		for (const interactable of this.interactables.values()) {
			interactable.object.getWorldPosition(this.targetPosition);
			const distance = camera.position.distanceTo(this.targetPosition);
			if (distance > (interactable.maxDistance ?? 3.25) || distance >= closestDistance) continue;

			this.targetDirection.copy(this.targetPosition).sub(camera.position).normalize();
			const facing = this.cameraDirection.dot(this.targetDirection);
			if (facing < (interactable.minimumFacing ?? 0.45)) continue;

			closest = interactable;
			closestDistance = distance;
		}

		// 候选目标必须连续多帧稳定（约 90ms @60fps）才显示提示，
		// 避免行走中路过交互范围边缘时，提示反复突变/闪烁
		if (this.candidate !== closest) {
			this.candidate = closest;
			this.candidateStableFrames = 0;
		} else if (closest !== null) {
			this.candidateStableFrames += 1;
		}
		const target = this.candidateStableFrames >= this.stableFramesRequired ? this.candidate : null;
		this.setActive(target);
	}

	interact(): void {
		this.active?.onInteract();
	}

	dispose(): void {
		this.setActive(null);
		this.interactables.clear();
	}

	private setActive(next: Interactable | null): void {
		if (next === this.active) return;
		this.active?.onFocusChange?.(false);
		this.active = next;
		this.active?.onFocusChange?.(true);
		this.onActiveChange(next ? { id: next.id, prompt: next.prompt } : null);
	}
}
