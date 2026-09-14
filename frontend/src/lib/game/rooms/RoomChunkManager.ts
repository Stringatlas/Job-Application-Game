import * as THREE from 'three';
import {
	CEILING_HEIGHT,
	createLightPlacements,
	createOfficeWalls,
	ROOMS,
	WALL_THICKNESS,
	type HallwayDefinition,
	type LightPlacement,
	type RectSpace,
	type RoomDefinition
} from '../scene/OfficeLayout';
import type { ProceduralRoomGraph } from './ProceduralRoomGraph';

export const ROOM_LOAD_DISTANCE = 52;
export const ROOM_UNLOAD_DISTANCE = 68;
const PROCEDURAL_LIGHT_COUNT = 12;
const LIGHT_REASSIGN_DISTANCE = 4;

export interface CollisionBox {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface ProceduralWorldBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface RoomChunkMaterials {
	floor: THREE.Material;
	ceiling: THREE.Material;
	walls: {
		primary: THREE.Material;
		secondary: THREE.Material;
	};
	fixture: THREE.Material;
}

interface SharedChunkGeometry {
	floor: THREE.PlaneGeometry;
	ceiling: THREE.PlaneGeometry;
	wall: THREE.BoxGeometry;
	fixture: THREE.PlaneGeometry;
}

function distanceToSpace(x: number, z: number, space: RectSpace): number {
	const nearestX = THREE.MathUtils.clamp(x, space.x, space.x + space.width);
	const nearestZ = THREE.MathUtils.clamp(z, space.z, space.z + space.depth);
	return Math.hypot(x - nearestX, z - nearestZ);
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	if (a.size !== b.size) return false;
	for (const id of a) if (!b.has(id)) return false;
	return true;
}

export class RoomChunkManager {
	private readonly root = new THREE.Group();
	private readonly spaces: Array<RoomDefinition | HallwayDefinition>;
	private readonly spacesById: Map<string, RoomDefinition | HallwayDefinition>;
	private readonly coreIds = new Set(ROOMS.map((space) => space.id));
	private readonly loadedIds = new Set<string>();
	private readonly actualLights = Array.from(
		{ length: PROCEDURAL_LIGHT_COUNT },
		() => new THREE.PointLight('#d9d38c', 0, 9, 2.1)
	);
	private fixturePlacements: LightPlacement[] = [];
	private fixtureInstances: THREE.InstancedMesh | null = null;
	private assignedPlacements: Array<LightPlacement | null> = [];
	private readonly flickerColor = new THREE.Color();
	private lastFixtureFlickerFrame = -1;
	private lastLightAssignmentX = Infinity;
	private lastLightAssignmentZ = Infinity;
	private wallColliders: CollisionBox[] = [];

	readonly bounds: ProceduralWorldBounds;

	constructor(
		private readonly scene: THREE.Scene,
		private readonly graph: ProceduralRoomGraph,
		private readonly materials: RoomChunkMaterials,
		private readonly geometry: SharedChunkGeometry
	) {
		this.root.name = 'procedural-room-chunks';
		this.scene.add(this.root);
		for (const [index, light] of this.actualLights.entries()) {
			light.name = `procedural-light:${index}`;
			light.castShadow = false;
			this.scene.add(light);
		}
		this.spaces = [...graph.rooms, ...graph.hallways];
		this.spacesById = new Map(this.spaces.map((space) => [space.id, space]));
		const allRooms = [...ROOMS, ...graph.rooms];
		this.bounds = {
			minX: Math.min(...allRooms.map((room) => room.x)) + WALL_THICKNESS / 2 + 0.28,
			maxX: Math.max(...allRooms.map((room) => room.x + room.width)) - WALL_THICKNESS / 2 - 0.28,
			minZ: Math.min(...allRooms.map((room) => room.z)) + WALL_THICKNESS / 2 + 0.28,
			maxZ: Math.max(...allRooms.map((room) => room.z + room.depth)) - WALL_THICKNESS / 2 - 0.28
		};
		this.updateStreaming(0, 8.15);
		this.assignNearestLights(0, 8.15, true);
	}

	update(playerPosition: THREE.Vector3, elapsedSeconds: number): void {
		this.updateStreaming(playerPosition.x, playerPosition.z);
		this.assignNearestLights(playerPosition.x, playerPosition.z);
		this.updateLightFlicker(elapsedSeconds);
	}

	getWallColliders(): readonly CollisionBox[] {
		return this.wallColliders;
	}

	getLoadedSpaceCount(): number {
		return this.loadedIds.size;
	}

	dispose(): void {
		this.clearRenderedChunks();
		this.scene.remove(this.root);
		for (const light of this.actualLights) this.scene.remove(light);
		this.loadedIds.clear();
	}

	private updateStreaming(x: number, z: number): void {
		const nextIds = new Set<string>();
		for (const space of this.spaces) {
			const threshold = this.loadedIds.has(space.id)
				? ROOM_UNLOAD_DISTANCE
				: ROOM_LOAD_DISTANCE;
			if (distanceToSpace(x, z, space) <= threshold) nextIds.add(space.id);
		}
		if (sameIds(this.loadedIds, nextIds)) return;
		this.loadedIds.clear();
		for (const id of nextIds) this.loadedIds.add(id);
		this.rebuildRenderedChunks();
	}

	private rebuildRenderedChunks(): void {
		this.clearRenderedChunks();
		const activeSpaces = [...this.loadedIds]
			.map((id) => this.spacesById.get(id))
			.filter((space): space is RoomDefinition | HallwayDefinition => Boolean(space));
		const availableIds = new Set([...this.coreIds, ...this.loadedIds]);
		const activeOpenings = this.graph.openings.filter(
			(opening) => availableIds.has(opening.between[0]) && availableIds.has(opening.between[1])
		);

		this.addSpaceInstances(activeSpaces);
		const walls = createOfficeWalls(
			[...ROOMS, ...activeSpaces],
			activeOpenings,
			this.loadedIds
		);
		this.addWallInstances(walls);
		const placements = createLightPlacements(activeSpaces, this.graph.seed, 12);
		this.fixturePlacements = placements;
		this.lastLightAssignmentX = Infinity;
		this.lastLightAssignmentZ = Infinity;
		const fixtures = new THREE.InstancedMesh(
			this.geometry.fixture,
			this.materials.fixture,
			placements.length
		);
		const dummy = new THREE.Object3D();
		for (let index = 0; index < placements.length; index += 1) {
			const placement = placements[index];
			dummy.position.set(placement.x, CEILING_HEIGHT - 0.015, placement.z);
			dummy.rotation.set(Math.PI / 2, placement.rotation, 0, 'YXZ');
			dummy.scale.set(placement.fixtureLength, 1, 1);
			dummy.updateMatrix();
			fixtures.setMatrixAt(index, dummy.matrix);
		}
		fixtures.instanceMatrix.needsUpdate = true;
		fixtures.frustumCulled = false;
		this.fixtureInstances = fixtures;
		this.root.add(fixtures);
	}

	private assignNearestLights(x: number, z: number, force = false): void {
		if (
			!force &&
			Math.hypot(x - this.lastLightAssignmentX, z - this.lastLightAssignmentZ) <
				LIGHT_REASSIGN_DISTANCE
		) {
			return;
		}
		this.lastLightAssignmentX = x;
		this.lastLightAssignmentZ = z;
		const nearest = [...this.fixturePlacements]
			.sort((a, b) =>
				Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)
			)
			.slice(0, PROCEDURAL_LIGHT_COUNT);
		this.assignedPlacements = this.actualLights.map((light, index) => {
			const placement = nearest[index];
			if (!placement) {
				light.position.set(0, -100, 0);
				light.intensity = 0;
				return null;
			}
			light.position.set(placement.x, CEILING_HEIGHT - 0.25, placement.z);
			light.distance = placement.range;
			return placement;
		});
	}

	private updateLightFlicker(elapsedSeconds: number): void {
		const fixtureFlickerFrame = Math.floor(elapsedSeconds * 24);
		if (
			this.fixtureInstances &&
			fixtureFlickerFrame !== this.lastFixtureFlickerFrame
		) {
			this.lastFixtureFlickerFrame = fixtureFlickerFrame;
			for (let index = 0; index < this.fixturePlacements.length; index += 1) {
				const brightness = this.getFlickerBrightness(
					this.fixturePlacements[index],
					elapsedSeconds
				);
				this.flickerColor.setRGB(brightness, brightness, brightness);
				this.fixtureInstances.setColorAt(index, this.flickerColor);
			}
			if (this.fixtureInstances.instanceColor) {
				this.fixtureInstances.instanceColor.needsUpdate = true;
			}
		}
		for (let index = 0; index < this.actualLights.length; index += 1) {
			const placement = this.assignedPlacements[index];
			if (!placement) continue;
			this.actualLights[index].intensity =
				placement.intensity * this.getFlickerBrightness(placement, elapsedSeconds);
		}
	}

	private getFlickerBrightness(
		placement: LightPlacement,
		elapsedSeconds: number
	): number {
		const cycle = (elapsedSeconds + placement.seed * 0.619) % 7.5;
		if (cycle < 0.24) {
			return Math.sin((elapsedSeconds + placement.seed) * 91) > 0.08 ? 1 : 0.22;
		}
		return 0.985 + Math.sin(elapsedSeconds * 7.3 + placement.seed) * 0.015;
	}

	private addSpaceInstances(spaces: RectSpace[]): void {
		const floor = new THREE.InstancedMesh(this.geometry.floor, this.materials.floor, spaces.length);
		const ceiling = new THREE.InstancedMesh(
			this.geometry.ceiling,
			this.materials.ceiling,
			spaces.length
		);
		const dummy = new THREE.Object3D();
		for (let index = 0; index < spaces.length; index += 1) {
			const space = spaces[index];
			dummy.position.set(space.x + space.width / 2, 0, space.z + space.depth / 2);
			dummy.rotation.set(-Math.PI / 2, 0, 0);
			dummy.scale.set(space.width, space.depth, 1);
			dummy.updateMatrix();
			floor.setMatrixAt(index, dummy.matrix);

			dummy.position.y = CEILING_HEIGHT;
			dummy.rotation.x = Math.PI / 2;
			dummy.updateMatrix();
			ceiling.setMatrixAt(index, dummy.matrix);
		}
		floor.instanceMatrix.needsUpdate = true;
		ceiling.instanceMatrix.needsUpdate = true;
		this.root.add(floor, ceiling);
	}

	private addWallInstances(walls: ReturnType<typeof createOfficeWalls>): void {
		for (const finish of ['primary', 'secondary'] as const) {
			const matchingWalls = walls.filter((wall) => wall.finish === finish);
			const instances = new THREE.InstancedMesh(
				this.geometry.wall,
				this.materials.walls[finish],
				matchingWalls.length
			);
			const dummy = new THREE.Object3D();
			for (let index = 0; index < matchingWalls.length; index += 1) {
				const wall = matchingWalls[index];
				const length = wall.to - wall.from;
				if (wall.axis === 'x') {
					dummy.position.set((wall.from + wall.to) / 2, CEILING_HEIGHT / 2, wall.fixed);
					dummy.rotation.set(0, 0, 0);
					this.wallColliders.push({
						minX: wall.from,
						maxX: wall.to,
						minZ: wall.fixed - WALL_THICKNESS / 2,
						maxZ: wall.fixed + WALL_THICKNESS / 2
					});
				} else {
					dummy.position.set(wall.fixed, CEILING_HEIGHT / 2, (wall.from + wall.to) / 2);
					dummy.rotation.set(0, Math.PI / 2, 0);
					this.wallColliders.push({
						minX: wall.fixed - WALL_THICKNESS / 2,
						maxX: wall.fixed + WALL_THICKNESS / 2,
						minZ: wall.from,
						maxZ: wall.to
					});
				}
				dummy.scale.set(length, 1, 1);
				dummy.updateMatrix();
				instances.setMatrixAt(index, dummy.matrix);
			}
			instances.instanceMatrix.needsUpdate = true;
			this.root.add(instances);
		}
	}

	private clearRenderedChunks(): void {
		this.fixturePlacements = [];
		this.fixtureInstances = null;
		this.lastFixtureFlickerFrame = -1;
		this.assignedPlacements = [];
		this.wallColliders = [];
		this.root.clear();
	}
}
