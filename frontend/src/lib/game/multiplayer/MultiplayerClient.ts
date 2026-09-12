import { createWebSocketTicket, websocketUrl } from '$lib/api/client';
import type { ChatEntry, ConnectionStatus, PlayerState, Vector3State } from './types';

interface LocalTransform {
	position: Vector3State;
	rotation: number;
}

interface MultiplayerEvents {
	onPlayersChange: (players: PlayerState[], selfId: string | null) => void;
	onChatEntry: (entry: ChatEntry) => void;
	onStatusChange: (status: ConnectionStatus) => void;
}

const UPDATE_INTERVAL_MS = 75;
const MAX_RECONNECT_DELAY_MS = 8_000;

export class MultiplayerClient {
	private socket: WebSocket | null = null;
	private players = new Map<string, PlayerState>();
	private selfId: string | null = null;
	private stopped = true;
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private movementTimer: ReturnType<typeof setInterval> | null = null;
	private lastTransform = '';

	constructor(
		private readonly getLocalTransform: () => LocalTransform,
		private readonly events: MultiplayerEvents
	) {}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		void this.connect();
	}

	stop(): void {
		this.stopped = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		if (this.movementTimer) clearInterval(this.movementTimer);
		this.reconnectTimer = null;
		this.movementTimer = null;
		this.socket?.close(1000, 'Leaving lobby');
		this.socket = null;
		this.players.clear();
		this.selfId = null;
		this.events.onPlayersChange([], null);
		this.events.onStatusChange('disconnected');
	}

	sendChat(text: string): boolean {
		const trimmed = text.trim();
		if (!trimmed || trimmed.length > 300 || this.socket?.readyState !== WebSocket.OPEN) {
			return false;
		}
		this.socket.send(JSON.stringify({ type: 'chat.send', payload: { text: trimmed } }));
		return true;
	}

	private async connect(): Promise<void> {
		this.events.onStatusChange(this.reconnectAttempt ? 'reconnecting' : 'connecting');
		try {
			const { ticket } = await createWebSocketTicket();
			if (this.stopped) return;
			const socket = new WebSocket(websocketUrl(ticket));
			this.socket = socket;
			socket.addEventListener('open', () => this.handleOpen(socket));
			socket.addEventListener('message', (event) => this.handleMessage(event));
			socket.addEventListener('close', () => this.handleClose(socket));
			socket.addEventListener('error', () => socket.close());
		} catch {
			this.scheduleReconnect();
		}
	}

	private handleOpen(socket: WebSocket): void {
		if (socket !== this.socket) return;
		this.reconnectAttempt = 0;
		this.events.onStatusChange('connected');
		this.movementTimer = setInterval(() => this.sendMovement(), UPDATE_INTERVAL_MS);
	}

	private handleClose(socket: WebSocket): void {
		if (socket !== this.socket) return;
		this.socket = null;
		if (this.movementTimer) clearInterval(this.movementTimer);
		this.movementTimer = null;
		this.players.clear();
		this.selfId = null;
		this.events.onPlayersChange([], null);
		if (!this.stopped) this.scheduleReconnect();
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		this.events.onStatusChange('reconnecting');
		const delay = Math.min(500 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS);
		this.reconnectAttempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connect();
		}, delay);
	}

	private sendMovement(): void {
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		const transform = this.getLocalTransform();
		const serialized = JSON.stringify(transform);
		if (serialized === this.lastTransform) return;
		this.lastTransform = serialized;
		this.socket.send(JSON.stringify({ type: 'player.move', payload: transform }));
	}

	private handleMessage(event: MessageEvent): void {
		let message: unknown;
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (!isRecord(message) || typeof message.type !== 'string' || !isRecord(message.payload)) return;
		const payload = message.payload;

		if (message.type === 'lobby.welcome' && typeof payload.self_id === 'string' && Array.isArray(payload.players)) {
			this.selfId = payload.self_id;
			this.players = new Map(payload.players.filter(isPlayer).map((player) => [player.id, player]));
			this.emitPlayers();
		} else if (message.type === 'player.joined' && isPlayer(payload)) {
			this.players.set(payload.id, payload);
			this.emitPlayers();
			this.systemMessage(`${payload.username} entered the office.`);
		} else if (message.type === 'player.moved' && isMovement(payload)) {
			const player = this.players.get(payload.id);
			if (player) {
				player.position = payload.position;
				player.rotation = payload.rotation;
				this.emitPlayers();
			}
		} else if (message.type === 'player.left' && typeof payload.id === 'string' && typeof payload.username === 'string') {
			this.players.delete(payload.id);
			this.emitPlayers();
			this.systemMessage(`${payload.username} left the office.`);
		} else if (message.type === 'chat.message' && typeof payload.id === 'string' && typeof payload.username === 'string' && typeof payload.text === 'string') {
			this.events.onChatEntry({
				id: payload.id,
				kind: 'message',
				username: payload.username,
				text: payload.text,
				sentAt: typeof payload.sent_at === 'string' ? payload.sent_at : new Date().toISOString()
			});
		}
	}

	private systemMessage(text: string): void {
		this.events.onChatEntry({ id: crypto.randomUUID(), kind: 'system', text, sentAt: new Date().toISOString() });
	}

	private emitPlayers(): void {
		this.events.onPlayersChange([...this.players.values()], this.selfId);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isVector(value: unknown): value is Vector3State {
	return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number';
}

function isPlayer(value: unknown): value is PlayerState {
	return isRecord(value) && typeof value.id === 'string' && typeof value.username === 'string' && isVector(value.position) && typeof value.rotation === 'number';
}

function isMovement(value: unknown): value is { id: string; position: Vector3State; rotation: number } {
	return isRecord(value) && typeof value.id === 'string' && isVector(value.position) && typeof value.rotation === 'number';
}
