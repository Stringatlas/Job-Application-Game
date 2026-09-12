/**
 * 一份数据即唯一真源：几何围墙 / 碰撞体 / 玩家边界框全部从这里派生。
 * 门与墙显式地列为独立段，共享墙只由「一个」段定义，避免墙体重叠闪屏。
 */

export const WALL_THICKNESS = 0.5;

export type WallAxis = 'x' | 'z';

export interface DoorSpec {
	id: string;
	/** 门洞宽度（米） */
	width: number;
	/** 门洞中心（在线轴方向上） */
	center: number;
	/** 'pass' 表示必须已认证才能开启 */
	lock?: 'pass';
}

export interface WallSegment {
	/** 调试/日志用的标识 */
	id: string;
	/** 墙沿哪个轴延伸：'x' 表示沿 x 轴延伸（z 为常量），反之同理 */
	axis: WallAxis;
	/** 常量坐标：axis='x' 时为 z，axis='z' 时为 x */
	at: number;
	/** 墙段在线轴方向上的区间 */
	range: readonly [number, number];
	/** 墙面颜色，默认浅苔绿色；深色用于储藏间等 */
	color?: string;
	/** 这面墙上是否开门洞 */
	door?: DoorSpec;
}

export interface LampPreset {
	x: number;
	z: number;
	intensity: number;
	color?: string;
	castShadow?: boolean;
}

export interface LightPreset {
	lamps: readonly LampPreset[];
}

export type LightPresetName = 'reception' | 'dim' | 'warm' | 'storage';

export interface FurniturePreset {
	/** 阻挡区 [xMin, zMin, xMax, zMax]，自动纳入碰撞（桌子等） */
	blocked: readonly (readonly [number, number, number, number])[];
}

export interface RoomSpec {
	id: string;
	name: string;
	bounds: { xMin: number; xMax: number; zMin: number; zMax: number };
	floorColor: string;
	ceilingColor: string;
	lightPreset: LightPresetName;
	furniture: keyof typeof FURNITURE_PRESETS | null;
}

export interface PlayerBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export type Airwall = {
	xMin: number;
	xMax: number;
	zMin: number;
	zMax: number;
	active: boolean;
	/** wall=几何墙 door=门洞门板 furniture=家具阻挡 */
	kind: 'wall' | 'door' | 'furniture';
	/** 门型障碍物关联的门 id */
	door?: string;
};

export const LIGHT_PRESETS: Record<LightPresetName, LightPreset> = {
	reception: {
		lamps: [
			{ x: -3.5, z: -5.8, intensity: 10 },
			{ x: 3.2, z: -0.4, intensity: 7, castShadow: true },
			{ x: -2.8, z: 3.2, intensity: 9 },
			{ x: 0, z: 7.5, intensity: 5 }
		]
	},
	dim: {
		lamps: [
			{ x: 8.6, z: 0, intensity: 6.5, color: '#c6c270' },
			{ x: 14.2, z: 0, intensity: 6, color: '#c6c270' }
		]
	},
	warm: {
		lamps: [
			{ x: 8.4, z: 6.5, intensity: 8, color: '#e9cfa8' },
			{ x: 13.8, z: 6.5, intensity: 7.5, color: '#e9cfa8' }
		]
	},
	storage: {
		lamps: [{ x: 0, z: 7.4, intensity: 4, color: '#b9b584' }]
	}
};

export const FURNITURE_PRESETS: Record<string, FurniturePreset> = {
	'kiosk-desk': {
		blocked: [[1.35, -3.24, 4.85, -1.58]]
	},
	'interview-desk': {
		blocked: []
	}
};

/** 房间与墙段拓扑：共享墙只列一次，不做任何运行时「切墙」计算。 */
export const WORLD_MAP: { rooms: RoomSpec[]; walls: WallSegment[] } = {
	rooms: [
		{
			id: 'lobby',
			name: 'Lobby',
			bounds: { xMin: -7, xMax: 7, zMin: -9.25, zMax: 9.75 },
			floorColor: '#5c5738',
			ceilingColor: '#8a865c',
			lightPreset: 'reception',
			furniture: 'kiosk-desk'
		},
		{
			id: 'storage',
			name: 'Storage',
			bounds: { xMin: -2.4, xMax: 2.4, zMin: 5.52, zMax: 9.75 },
			floorColor: '#3a3526',
			ceilingColor: '#56512e',
			lightPreset: 'storage',
			furniture: null
		},
		{
			id: 'corridor',
			name: 'Corridor',
			bounds: { xMin: 7.25, xMax: 16, zMin: -2, zMax: 2 },
			floorColor: '#46412e',
			ceilingColor: '#63622f',
			lightPreset: 'dim',
			furniture: null
		},
		{
			id: 'interview',
			name: 'Interview room',
			bounds: { xMin: 7.25, xMax: 16, zMin: 2, zMax: 11 },
			floorColor: '#4f4a31',
			ceilingColor: '#6d683c',
			lightPreset: 'warm',
			furniture: 'interview-desk'
		}
	] as const,
	walls: [
		{ id: 'lobby-west', axis: 'z', at: -7.25, range: [-9.75, 10] },
		{ id: 'lobby-south', axis: 'x', at: -9.5, range: [-7.25, 7.25] },
		{ id: 'lobby-north', axis: 'x', at: 10, range: [-7.25, 7.25] },
		{ id: 'lobby-east-low', axis: 'z', at: 7.25, range: [-9.75, -2.15] },
		{
			id: 'lobby-east-hall',
			axis: 'z',
			at: 7.25,
			range: [-2.15, 2.15],
			door: { id: 'hall', center: 0, width: 2.4 }
		},
		{ id: 'lobby-east-high', axis: 'z', at: 7.25, range: [2.15, 9.75] },
		{ id: 'corridor-south', axis: 'x', at: -2, range: [7.25, 16] },
		{ id: 'corridor-east', axis: 'z', at: 16, range: [-2, 2] },
		{
			id: 'interview-south',
			axis: 'x',
			at: 2,
			range: [7.25, 16],
			door: { id: 'interview', center: 11.6, width: 2.2, lock: 'pass' }
		},
		{ id: 'interview-east', axis: 'z', at: 16, range: [2, 11] },
		{ id: 'interview-north', axis: 'x', at: 11, range: [7.25, 16] },
		{ id: 'interview-west', axis: 'z', at: 7.25, range: [9.75, 11] },
		{ id: 'storage-west', axis: 'z', at: -2.4, range: [5.52, 9.75], color: '#504d31' },
		{ id: 'storage-east', axis: 'z', at: 2.4, range: [5.52, 9.75], color: '#504d31' },
		{
			id: 'storage-front',
			axis: 'x',
			at: 5.32,
			range: [-2.4, 2.4],
			color: '#504d31',
			door: { id: 'gate', center: 0, width: 1.84 }
		}
	] as const
};

const half = WALL_THICKNESS / 2 + 0.05;

/** 从所有墙段外包络得出玩家边界框（内缩一个余量，避免玩家头贴墙） */
export function deriveBounds(walls: readonly WallSegment[]): PlayerBounds {
	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for (const wall of walls) {
		if (wall.axis === 'z') {
			minX = Math.min(minX, wall.at - half);
			maxX = Math.max(maxX, wall.at + half);
			minZ = Math.min(minZ, wall.range[0]);
			maxZ = Math.max(maxZ, wall.range[1]);
		} else {
			minZ = Math.min(minZ, wall.at - half);
			maxZ = Math.max(maxZ, wall.at + half);
			minX = Math.min(minX, wall.range[0]);
			maxX = Math.max(maxX, wall.range[1]);
		}
	}
	return {
		minX: minX + 0.25,
		maxX: maxX - 0.25,
		minZ: minZ + 0.25,
		maxZ: maxZ - 0.25
	};
}

/**
 * 从墙段 + 家具预设派生全部 2D 空気墙（碰撞体）。
 * 门洞门板是 kind='door' 的可开关门型障碍物；其余始终 active。
 */
export function deriveAirwalls(
	walls: readonly WallSegment[],
	furniture: readonly (readonly [string, FurniturePreset])[]
): Airwall[] {
	const airwalls: Airwall[] = [];
	for (const wall of walls) {
		const [a, b] = wall.range;
		const d0 = wall.door?.width ?? 0;
		const center = wall.door?.center ?? 0;
		const spans: Array<[number, number]> =
			d0 > 0 ? [[a, center - d0 / 2], [center + d0 / 2, b]] : [[a, b]];
		for (const [from, to] of spans) {
			if (to - from <= 0.001) continue;
			if (wall.axis === 'z') {
				airwalls.push({
					xMin: wall.at - half,
					xMax: wall.at + half,
					zMin: from,
					zMax: to,
					active: true,
					kind: 'wall'
				});
			} else {
				airwalls.push({
					xMin: from,
					xMax: to,
					zMin: wall.at - half,
					zMax: wall.at + half,
					active: true,
					kind: 'wall'
				});
			}
		}
		if (wall.door) {
			const doorX =
				wall.axis === 'z' ? [center - d0 / 2, center + d0 / 2] : [wall.at - half, wall.at + half];
			const doorZ =
				wall.axis === 'z' ? [wall.at - half, wall.at + half] : [center - d0 / 2, center + d0 / 2];
			airwalls.push({
				xMin: doorX[0],
				xMax: doorX[1],
				zMin: doorZ[0],
				zMax: doorZ[1],
				active: true,
				kind: 'door',
				door: wall.door.id
			});
		}
	}
	for (const [, preset] of furniture) {
		for (const [xMin, zMin, xMax, zMax] of preset.blocked) {
			airwalls.push({ xMin, xMax, zMin, zMax, active: true, kind: 'furniture' });
		}
	}
	return airwalls;
}

/** 汇总所有有家具阻挡声明的房间预设 */
export function furniturePresetsFor(rooms: readonly RoomSpec[]): Array<[string, FurniturePreset]> {
	return rooms
		.map((room) => (room.furniture ? [room.furniture, FURNITURE_PRESETS[room.furniture]] : null))
		.filter((entry): entry is [string, FurniturePreset] => entry !== null);
}

