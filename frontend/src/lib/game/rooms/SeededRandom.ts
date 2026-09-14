function hashString(seed: number, value: string): number {
	let hash = (seed ^ 0x811c9dc5) >>> 0;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x7feb352d);
	hash ^= hash >>> 15;
	hash = Math.imul(hash, 0x846ca68b);
	return (hash ^ (hash >>> 16)) >>> 0;
}

export function createSeededRandom(seed: number, stream: string): () => number {
	let state = hashString(seed, stream);
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function seededValue(seed: number, stream: string): number {
	return createSeededRandom(seed, stream)();
}
