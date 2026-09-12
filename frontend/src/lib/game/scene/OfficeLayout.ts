export interface RectSpace {
	id: string;
	x: number;
	z: number;
	width: number;
	depth: number;
	finish?: 'primary' | 'secondary';
}

export interface RoomDefinition extends RectSpace {
	kind: 'room';
}

export interface HallwayDefinition extends RectSpace {
	kind: 'hallway';
}

export interface OpeningDefinition {
	id: string;
	between: [string, string];
	width?: number;
	offset?: number;
}

export interface WallSpec {
	axis: 'x' | 'z';
	fixed: number;
	from: number;
	to: number;
	finish: 'primary' | 'secondary';
}

export interface LightPlacement {
	x: number;
	z: number;
	intensity: number;
	range: number;
	seed: number;
	fixtureLength: number;
	rotation: number;
}

export const CEILING_HEIGHT = 4.2;
export const WALL_THICKNESS = 0.28;
export const DOORWAY_WIDTH = 2.2;
export const SECURE_DOOR_Z = 5.15;

export const ROOMS: RoomDefinition[] = [
	// The two original spaces remain unchanged.
	{ id: 'main-office', kind: 'room', x: -7, z: -9.5, width: 14, depth: 14.65 },
	{ id: 'starting-room', kind: 'room', x: -2.4, z: 5.15, width: 4.8, depth: 4.85 },

	{ id: 'west-records', kind: 'room', x: -17, z: -9.5, width: 5, depth: 7.5, finish: 'secondary' },
	{ id: 'west-lounge', kind: 'room', x: -17, z: -2, width: 5, depth: 7.15 },
	{ id: 'east-archive', kind: 'room', x: 12, z: -9.5, width: 5, depth: 7.5, finish: 'secondary' },
	{ id: 'east-meeting', kind: 'room', x: 12, z: -2, width: 5, depth: 7.15 },
	{ id: 'south-storage', kind: 'room', x: -5, z: -17, width: 12, depth: 5, finish: 'secondary' },
	{ id: 'north-gallery', kind: 'room', x: -15, z: 15.5, width: 30, depth: 3.5, finish: 'secondary' }
];

export const HALLWAYS: HallwayDefinition[] = [
	{ id: 'west-lower-hall', kind: 'hallway', x: -12, z: -7, width: 5, depth: 2.5, finish: 'secondary' },
	{ id: 'west-upper-hall', kind: 'hallway', x: -12, z: 1, width: 5, depth: 2.5, finish: 'secondary' },
	{ id: 'east-lower-hall', kind: 'hallway', x: 7, z: -7, width: 5, depth: 2.5, finish: 'secondary' },
	{ id: 'east-upper-hall', kind: 'hallway', x: 7, z: 1, width: 5, depth: 2.5, finish: 'secondary' },
	{ id: 'south-west-hall', kind: 'hallway', x: 1.2, z: -12, width: 2.5, depth: 2.5, finish: 'secondary' },
	{ id: 'south-east-hall', kind: 'hallway', x: 4.5, z: -12, width: 2.5, depth: 2.5, finish: 'secondary' },
	{ id: 'west-north-hall', kind: 'hallway', x: -15, z: 5.15, width: 3, depth: 10.35, finish: 'secondary' },
	{ id: 'east-north-hall', kind: 'hallway', x: 12, z: 5.15, width: 3, depth: 10.35, finish: 'secondary' }
];

export const OPENINGS: OpeningDefinition[] = [
	{ id: 'secure-door', between: ['main-office', 'starting-room'], width: DOORWAY_WIDTH },

	// West room loop.
	{ id: 'main-to-west-lower', between: ['main-office', 'west-lower-hall'] },
	{ id: 'west-lower-to-records', between: ['west-lower-hall', 'west-records'] },
	{ id: 'west-records-to-lounge', between: ['west-records', 'west-lounge'] },
	{ id: 'west-lounge-to-upper', between: ['west-lounge', 'west-upper-hall'] },
	{ id: 'west-upper-to-main', between: ['west-upper-hall', 'main-office'] },

	// East room loop.
	{ id: 'main-to-east-lower', between: ['main-office', 'east-lower-hall'] },
	{ id: 'east-lower-to-archive', between: ['east-lower-hall', 'east-archive'] },
	{ id: 'east-archive-to-meeting', between: ['east-archive', 'east-meeting'] },
	{ id: 'east-meeting-to-upper', between: ['east-meeting', 'east-upper-hall'] },
	{ id: 'east-upper-to-main', between: ['east-upper-hall', 'main-office'] },

	// Two entrances turn the southern room into another circuit.
	{ id: 'main-to-south-west', between: ['main-office', 'south-west-hall'] },
	{ id: 'south-west-to-storage', between: ['south-west-hall', 'south-storage'] },
	{ id: 'storage-to-south-east', between: ['south-storage', 'south-east-hall'] },
	{ id: 'south-east-to-main', between: ['south-east-hall', 'main-office'] },

	// The northern gallery reconnects both wings into a large perimeter loop.
	{ id: 'west-lounge-to-north', between: ['west-lounge', 'west-north-hall'] },
	{ id: 'west-north-to-gallery', between: ['west-north-hall', 'north-gallery'] },
	{ id: 'gallery-to-east-north', between: ['north-gallery', 'east-north-hall'] },
	{ id: 'east-north-to-meeting', between: ['east-north-hall', 'east-meeting'] }
];

export const ALL_SPACES: Array<RoomDefinition | HallwayDefinition> = [...ROOMS, ...HALLWAYS];

export const LAYOUT_EXTENTS = ALL_SPACES.reduce(
	(bounds, space) => ({
		minX: Math.min(bounds.minX, space.x),
		maxX: Math.max(bounds.maxX, space.x + space.width),
		minZ: Math.min(bounds.minZ, space.z),
		maxZ: Math.max(bounds.maxZ, space.z + space.depth)
	}),
	{ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
);

export const OFFICE_BOUNDS = {
	minX: LAYOUT_EXTENTS.minX + 0.3,
	maxX: LAYOUT_EXTENTS.maxX - 0.3,
	minZ: LAYOUT_EXTENTS.minZ + 0.3,
	maxZ: LAYOUT_EXTENTS.maxZ - 0.3
} as const;

type Side = 'north' | 'south' | 'east' | 'west';
interface ResolvedOpening { side: Side; from: number; to: number; }

function resolveOpening(a: RectSpace, b: RectSpace, definition: OpeningDefinition): [ResolvedOpening, ResolvedOpening] {
	const epsilon = 0.001;
	let sideA: Side;
	let sideB: Side;
	let overlapFrom: number;
	let overlapTo: number;

	if (Math.abs(a.x + a.width - b.x) < epsilon || Math.abs(b.x + b.width - a.x) < epsilon) {
		const aIsWest = Math.abs(a.x + a.width - b.x) < epsilon;
		sideA = aIsWest ? 'east' : 'west';
		sideB = aIsWest ? 'west' : 'east';
		overlapFrom = Math.max(a.z, b.z);
		overlapTo = Math.min(a.z + a.depth, b.z + b.depth);
	} else if (Math.abs(a.z + a.depth - b.z) < epsilon || Math.abs(b.z + b.depth - a.z) < epsilon) {
		const aIsSouth = Math.abs(a.z + a.depth - b.z) < epsilon;
		sideA = aIsSouth ? 'north' : 'south';
		sideB = aIsSouth ? 'south' : 'north';
		overlapFrom = Math.max(a.x, b.x);
		overlapTo = Math.min(a.x + a.width, b.x + b.width);
	} else {
		throw new Error(`Opening ${definition.id} connects spaces that do not share an edge`);
	}

	if (overlapTo <= overlapFrom) throw new Error(`Opening ${definition.id} has no shared edge`);
	const available = overlapTo - overlapFrom;
	const width = Math.min(definition.width ?? DOORWAY_WIDTH, available);
	const center = (overlapFrom + overlapTo) / 2 + (definition.offset ?? 0);
	const from = Math.max(overlapFrom, Math.min(center - width / 2, overlapTo - width));
	const to = from + width;
	return [{ side: sideA, from, to }, { side: sideB, from, to }];
}

function subtractOpenings(from: number, to: number, openings: Array<{ from: number; to: number }>): Array<[number, number]> {
	const segments: Array<[number, number]> = [];
	let cursor = from;
	for (const opening of [...openings].sort((a, b) => a.from - b.from)) {
		if (opening.from > cursor) segments.push([cursor, opening.from]);
		cursor = Math.max(cursor, opening.to);
	}
	if (cursor < to) segments.push([cursor, to]);
	return segments;
}

function mergeCollinearWalls(walls: WallSpec[]): WallSpec[] {
	const groups = new Map<string, WallSpec[]>();
	for (const wall of walls) {
		const key = `${wall.axis}:${wall.fixed.toFixed(3)}`;
		groups.set(key, [...(groups.get(key) ?? []), wall]);
	}

	const merged: WallSpec[] = [];
	for (const group of groups.values()) {
		const sorted = group.sort((a, b) => a.from - b.from);
		let current = { ...sorted[0] };
		for (const next of sorted.slice(1)) {
			if (next.from <= current.to + 0.001) {
				current.to = Math.max(current.to, next.to);
				if (next.finish === 'primary') current.finish = 'primary';
			} else {
				merged.push(current);
				current = { ...next };
			}
		}
		merged.push(current);
	}
	return merged;
}

export function createOfficeWalls(): WallSpec[] {
	const spacesById = new Map(ALL_SPACES.map((space) => [space.id, space]));
	const openingsBySpace = new Map<string, ResolvedOpening[]>();
	for (const definition of OPENINGS) {
		const a = spacesById.get(definition.between[0]);
		const b = spacesById.get(definition.between[1]);
		if (!a || !b) throw new Error(`Opening ${definition.id} references an unknown space`);
		const [openingA, openingB] = resolveOpening(a, b, definition);
		openingsBySpace.set(a.id, [...(openingsBySpace.get(a.id) ?? []), openingA]);
		openingsBySpace.set(b.id, [...(openingsBySpace.get(b.id) ?? []), openingB]);
	}

	const walls: WallSpec[] = [];
	for (const space of ALL_SPACES) {
		const finish = space.finish ?? 'primary';
		const spaceOpenings = openingsBySpace.get(space.id) ?? [];
		const sides: Array<{ side: Side; axis: WallSpec['axis']; fixed: number; from: number; to: number }> = [
			{ side: 'south', axis: 'x', fixed: space.z, from: space.x, to: space.x + space.width },
			{ side: 'north', axis: 'x', fixed: space.z + space.depth, from: space.x, to: space.x + space.width },
			{ side: 'west', axis: 'z', fixed: space.x, from: space.z, to: space.z + space.depth },
			{ side: 'east', axis: 'z', fixed: space.x + space.width, from: space.z, to: space.z + space.depth }
		];
		for (const side of sides) {
			const openings = spaceOpenings.filter((opening) => opening.side === side.side);
			for (const [from, to] of subtractOpenings(side.from, side.to, openings)) {
				walls.push({ axis: side.axis, fixed: side.fixed, from, to, finish });
			}
		}
	}
	return mergeCollinearWalls(walls);
}

export function createLightPlacements(maxSpacing = 8): LightPlacement[] {
	let seed = 1;
	return ALL_SPACES.flatMap((space) => {
		const columns = Math.max(1, Math.ceil(space.width / maxSpacing));
		const rows = Math.max(1, Math.ceil(space.depth / maxSpacing));
		const cellWidth = space.width / columns;
		const cellDepth = space.depth / rows;
		const runsAlongX = cellWidth >= cellDepth;
		const availableLength = runsAlongX ? cellWidth : cellDepth;
		const placements: LightPlacement[] = [];
		for (let column = 0; column < columns; column += 1) {
			for (let row = 0; row < rows; row += 1) {
				placements.push({
					x: space.x + ((column + 0.5) * space.width) / columns,
					z: space.z + ((row + 0.5) * space.depth) / rows,
					intensity: space.kind === 'hallway' ? 13 : 15,
					range: space.kind === 'hallway' ? 7 : 8.5,
					seed: seed++,
					fixtureLength: Math.min(2.45, Math.max(1.4, availableLength - 0.5)),
					rotation: runsAlongX ? 0 : Math.PI / 2
				});
			}
		}
		return placements;
	});
}
