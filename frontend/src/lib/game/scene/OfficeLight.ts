import * as THREE from 'three';

export interface OfficeLightOptions {
	position: [number, number, number];
	intensity: number;
	range?: number;
	seed?: number;
	castShadow?: boolean;
	fixtureLength?: number;
	rotation?: number;
}

/** A complete ceiling fixture so every light can be tuned or animated independently. */
export class OfficeLight {
	readonly group = new THREE.Group();
	readonly light: THREE.PointLight;
	private readonly baseIntensity: number;
	private readonly seed: number;
	private readonly geometry: THREE.PlaneGeometry;
	private readonly material = new THREE.MeshBasicMaterial({
		color: '#ddd79b',
		transparent: true,
		opacity: 0.76,
		toneMapped: false
	});

	constructor({ position, intensity, range = 7, seed = 0, castShadow = false, fixtureLength = 2.45, rotation = 0 }: OfficeLightOptions) {
		this.baseIntensity = intensity;
		this.seed = seed;
		this.geometry = new THREE.PlaneGeometry(fixtureLength, 0.5);
		this.group.position.set(...position);
		this.group.rotation.y = rotation;

		const panel = new THREE.Mesh(this.geometry, this.material);
		panel.rotation.x = Math.PI / 2;
		panel.position.y = 0.235;
		this.group.add(panel);

		this.light = new THREE.PointLight('#d9d38c', intensity, range, 2.1);
		this.light.castShadow = castShadow;
		this.group.add(this.light);
	}

	update(elapsedSeconds: number): void {
		// Each fixture has a different, brief failure window so the whole room never strobes at once.
		const cycle = (elapsedSeconds + this.seed * 4.37) % (8.5 + this.seed * 0.61);
		const inFailureWindow = cycle < 0.18;
		const chatter = Math.sin((elapsedSeconds + this.seed) * 91) > 0.12 ? 1 : 0.55;
		const subtleHum = 0.985 + Math.sin(elapsedSeconds * 7.3 + this.seed) * 0.015;
		const brightness = inFailureWindow ? chatter : subtleHum;
		this.light.intensity = this.baseIntensity * brightness;
		this.material.opacity = 0.52 + brightness * 0.24;
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
	}
}
