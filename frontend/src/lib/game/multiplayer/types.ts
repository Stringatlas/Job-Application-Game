export interface Vector3State {
	x: number;
	y: number;
	z: number;
}

export interface PlayerState {
	id: string;
	username: string;
	position: Vector3State;
	rotation: number;
}

export interface ChatEntry {
	id: string;
	kind: 'system' | 'message';
	username?: string;
	text: string;
	sentAt: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

