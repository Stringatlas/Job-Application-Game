import type {
	HallwayDefinition,
	OpeningDefinition,
	RoomDefinition
} from '../scene/OfficeLayout';
import { DOORWAY_WIDTH, WALL_THICKNESS } from '../scene/OfficeLayout';
import { createSeededRandom, seededValue } from './SeededRandom';

export { createSeededRandom, seededValue } from './SeededRandom';

export const WORLD_SEED = 0x48434d55;
export const GRID_RADIUS = 4;
export const GRID_SPACING = 16;
export const HALLWAY_WIDTH = 2.6;
// Keep the debug build small while the room visuals and traversal are being tuned.
// Raise this toward the full 80-room lattice once profiling is acceptable.
export const DEBUG_GENERATION_LIMIT = 8;

const MIN_ROOM_SIZE = 8.4;
const MAX_ROOM_SIZE = 11.4;
const EXTRA_LOOP_CHANCE = 0.12;
const ANCHOR_ID = 'original-office';
const MAIN_OFFICE_ID = 'main-office';
const PLAYER_RADIUS = 0.28;

export interface RoomGraphEdge {
	id: string;
	a: string;
	b: string;
	hallwayId: string;
	anchor: boolean;
}

export interface ProceduralRoomGraph {
	seed: number;
	rooms: RoomDefinition[];
	hallways: HallwayDefinition[];
	openings: OpeningDefinition[];
	edges: RoomGraphEdge[];
}

interface GridRoom extends RoomDefinition {
	gridX: number;
	gridZ: number;
}

interface CandidateEdge {
	a: string;
	b: string;
	anchor: boolean;
}

class DisjointSet {
	private readonly parents = new Map<string, string>();

	constructor(ids: string[]) {
		for (const id of ids) this.parents.set(id, id);
	}

	find(id: string): string {
		const parent = this.parents.get(id);
		if (!parent) throw new Error(`Unknown room graph vertex: ${id}`);
		if (parent === id) return id;
		const root = this.find(parent);
		this.parents.set(id, root);
		return root;
	}

	union(a: string, b: string): boolean {
		const rootA = this.find(a);
		const rootB = this.find(b);
		if (rootA === rootB) return false;
		this.parents.set(rootB, rootA);
		return true;
	}
}

function shuffled<T>(values: T[], seed: number, stream: string): T[] {
	const result = [...values];
	const random = createSeededRandom(seed, stream);
	for (let index = result.length - 1; index > 0; index -= 1) {
		const target = Math.floor(random() * (index + 1));
		[result[index], result[target]] = [result[target], result[index]];
	}
	return result;
}

function roomId(gridX: number, gridZ: number): string {
	return `room:${gridX}:${gridZ}`;
}

function createRooms(seed: number): GridRoom[] {
	const rooms: GridRoom[] = [];
	for (let gridZ = -GRID_RADIUS; gridZ <= GRID_RADIUS; gridZ += 1) {
		for (let gridX = -GRID_RADIUS; gridX <= GRID_RADIUS; gridX += 1) {
			if (gridX === 0 && gridZ === 0) continue;
			const id = roomId(gridX, gridZ);
			const random = createSeededRandom(seed, id);
			const width = MIN_ROOM_SIZE + random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE);
			const depth = MIN_ROOM_SIZE + random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE);
			rooms.push({
				id,
				kind: 'room',
				gridX,
				gridZ,
				x: gridX * GRID_SPACING - width / 2,
				z: gridZ * GRID_SPACING - depth / 2,
				width,
				depth,
				finish: random() < 0.38 ? 'secondary' : 'primary'
			});
		}
	}
	return rooms
		.sort((a, b) => {
			const ringA = Math.max(Math.abs(a.gridX), Math.abs(a.gridZ));
			const ringB = Math.max(Math.abs(b.gridX), Math.abs(b.gridZ));
			return ringA - ringB || a.gridZ - b.gridZ || a.gridX - b.gridX;
		})
		.slice(0, DEBUG_GENERATION_LIMIT);
}

function createCandidateEdges(rooms: GridRoom[]): CandidateEdge[] {
	const ids = new Set(rooms.map((room) => room.id));
	const candidates: CandidateEdge[] = [];
	for (const room of rooms) {
		for (const [offsetX, offsetZ] of [[1, 0], [0, 1]] as const) {
			const neighbor = roomId(room.gridX + offsetX, room.gridZ + offsetZ);
			if (ids.has(neighbor)) candidates.push({ a: room.id, b: neighbor, anchor: false });
		}
	}
	return candidates;
}

function chooseGraphEdges(rooms: GridRoom[], seed: number): CandidateEdge[] {
	const forcedAnchorEdges: CandidateEdge[] = [
		{ a: ANCHOR_ID, b: roomId(-1, 0), anchor: true },
		{ a: ANCHOR_ID, b: roomId(1, 0), anchor: true }
	];
	const candidates = createCandidateEdges(rooms);
	const disjoint = new DisjointSet([ANCHOR_ID, ...rooms.map((room) => room.id)]);
	const selected: CandidateEdge[] = [];
	for (const edge of forcedAnchorEdges) {
		disjoint.union(edge.a, edge.b);
		selected.push(edge);
	}
	for (const edge of shuffled(candidates, seed, 'spanning-tree')) {
		if (disjoint.union(edge.a, edge.b)) selected.push(edge);
	}

	const selectedKeys = new Set(selected.map((edge) => [edge.a, edge.b].sort().join('|')));
	for (const edge of candidates) {
		const key = [edge.a, edge.b].sort().join('|');
		if (
			!selectedKeys.has(key) &&
			seededValue(seed, `loop:${key}`) < EXTRA_LOOP_CHANCE
		) {
			selected.push(edge);
		}
	}
	return selected;
}

function chooseCenter(
	from: number,
	to: number,
	seed: number,
	stream: string
): number {
	const halfWidth = HALLWAY_WIDTH / 2;
	const minimum = from + halfWidth + WALL_THICKNESS;
	const maximum = to - halfWidth - WALL_THICKNESS;
	if (maximum < minimum) return (from + to) / 2;
	return minimum + seededValue(seed, stream) * (maximum - minimum);
}

function createHallway(
	edge: CandidateEdge,
	index: number,
	roomsById: Map<string, GridRoom>,
	seed: number
): {
	hallway: HallwayDefinition;
	openings: [OpeningDefinition, OpeningDefinition];
	graphEdge: RoomGraphEdge;
} {
	const hallwayId = `hall:${index}:${edge.a}:${edge.b}`;
	let hallway: HallwayDefinition;
	let firstSpaceId: string;
	let secondSpaceId: string;

	if (edge.anchor) {
		const room = roomsById.get(edge.b);
		if (!room) throw new Error(`Anchor edge references missing room ${edge.b}`);
		const centerZ = 2.25;
		if (room.gridX < 0) {
			const roomEdge = room.x + room.width;
			hallway = {
				id: hallwayId,
				kind: 'hallway',
				x: roomEdge,
				z: centerZ - HALLWAY_WIDTH / 2,
				width: -7 - roomEdge,
				depth: HALLWAY_WIDTH,
				finish: 'secondary'
			};
		} else {
			hallway = {
				id: hallwayId,
				kind: 'hallway',
				x: 7,
				z: centerZ - HALLWAY_WIDTH / 2,
				width: room.x - 7,
				depth: HALLWAY_WIDTH,
				finish: 'secondary'
			};
		}
		firstSpaceId = MAIN_OFFICE_ID;
		secondSpaceId = room.id;
	} else {
		const a = roomsById.get(edge.a);
		const b = roomsById.get(edge.b);
		if (!a || !b) throw new Error(`Edge references missing room ${edge.a} or ${edge.b}`);
		if (a.gridZ === b.gridZ) {
			const [left, right] = a.x < b.x ? [a, b] : [b, a];
			const overlapFrom = Math.max(left.z, right.z);
			const overlapTo = Math.min(left.z + left.depth, right.z + right.depth);
			const center = chooseCenter(overlapFrom, overlapTo, seed, hallwayId);
			hallway = {
				id: hallwayId,
				kind: 'hallway',
				x: left.x + left.width,
				z: center - HALLWAY_WIDTH / 2,
				width: right.x - (left.x + left.width),
				depth: HALLWAY_WIDTH,
				finish: 'secondary'
			};
			firstSpaceId = left.id;
			secondSpaceId = right.id;
		} else {
			const [south, north] = a.z < b.z ? [a, b] : [b, a];
			const overlapFrom = Math.max(south.x, north.x);
			const overlapTo = Math.min(south.x + south.width, north.x + north.width);
			const center = chooseCenter(overlapFrom, overlapTo, seed, hallwayId);
			hallway = {
				id: hallwayId,
				kind: 'hallway',
				x: center - HALLWAY_WIDTH / 2,
				z: south.z + south.depth,
				width: HALLWAY_WIDTH,
				depth: north.z - (south.z + south.depth),
				finish: 'secondary'
			};
			firstSpaceId = south.id;
			secondSpaceId = north.id;
		}
	}

	if (hallway.width <= 0 || hallway.depth <= 0) {
		throw new Error(`Hallway ${hallway.id} has invalid dimensions`);
	}
	return {
		hallway,
		openings: [
			{
				id: `${hallwayId}:a`,
				between: [firstSpaceId, hallwayId],
				width: HALLWAY_WIDTH
			},
			{
				id: `${hallwayId}:b`,
				between: [hallwayId, secondSpaceId],
				width: HALLWAY_WIDTH
			}
		],
		graphEdge: {
			id: `edge:${index}`,
			a: edge.a,
			b: edge.b,
			hallwayId,
			anchor: edge.anchor
		}
	};
}

export function validateProceduralRoomGraph(graph: ProceduralRoomGraph): void {
	const ids = [
		...graph.rooms.map((room) => room.id),
		...graph.hallways.map((hallway) => hallway.id)
	];
	if (new Set(ids).size !== ids.length) throw new Error('Procedural layout contains duplicate IDs');

	const minimumClearSize = HALLWAY_WIDTH + WALL_THICKNESS * 2 + PLAYER_RADIUS * 2;
	for (const room of graph.rooms) {
		if (room.width < minimumClearSize || room.depth < minimumClearSize) {
			throw new Error(`Room ${room.id} is too small for safe doorway clearance`);
		}
	}
	for (let first = 0; first < graph.rooms.length; first += 1) {
		const a = graph.rooms[first];
		for (let second = first + 1; second < graph.rooms.length; second += 1) {
			const b = graph.rooms[second];
			const overlaps =
				a.x < b.x + b.width &&
				a.x + a.width > b.x &&
				a.z < b.z + b.depth &&
				a.z + a.depth > b.z;
			if (overlaps) throw new Error(`Rooms ${a.id} and ${b.id} overlap`);
		}
	}

	const adjacency = new Map<string, string[]>();
	for (const edge of graph.edges) {
		adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge.b]);
		adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge.a]);
	}
	const visited = new Set<string>([ANCHOR_ID]);
	const pending = [ANCHOR_ID];
	while (pending.length > 0) {
		const id = pending.shift();
		if (!id) break;
		for (const neighbor of adjacency.get(id) ?? []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				pending.push(neighbor);
			}
		}
	}
	if (graph.rooms.some((room) => !visited.has(room.id))) {
		throw new Error('Procedural room graph contains an inaccessible room');
	}
	if (graph.openings.some((opening) => (opening.width ?? DOORWAY_WIDTH) < DOORWAY_WIDTH)) {
		throw new Error('Procedural layout contains an undersized doorway');
	}
}

export function generateProceduralRoomGraph(seed = WORLD_SEED): ProceduralRoomGraph {
	const rooms = createRooms(seed);
	const roomsById = new Map(rooms.map((room) => [room.id, room]));
	const selectedEdges = chooseGraphEdges(rooms, seed);
	const builtEdges = selectedEdges.map((edge, index) =>
		createHallway(edge, index, roomsById, seed)
	);
	const graph: ProceduralRoomGraph = {
		seed,
		rooms: rooms.map(({ gridX: _gridX, gridZ: _gridZ, ...room }) => room),
		hallways: builtEdges.map(({ hallway }) => hallway),
		openings: builtEdges.flatMap(({ openings }) => openings),
		edges: builtEdges.map(({ graphEdge }) => graphEdge)
	};
	validateProceduralRoomGraph(graph);
	return graph;
}

export function assertProceduralGenerationDeterminism(seed = WORLD_SEED): void {
	const first = generateProceduralRoomGraph(seed);
	const repeated = generateProceduralRoomGraph(seed);
	if (JSON.stringify(first) !== JSON.stringify(repeated)) {
		throw new Error('Procedural generation is not deterministic for the same seed');
	}
	const alternate = generateProceduralRoomGraph(seed ^ 0x9e3779b9);
	if (JSON.stringify(first.rooms) === JSON.stringify(alternate.rooms)) {
		throw new Error('Procedural generation does not vary with its seed');
	}
}
