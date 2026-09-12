<script lang="ts">
	import { onMount } from 'svelte';
	import { GameWorld } from '$lib/game/GameWorld';
	import MultiplayerOverlay from '$lib/components/MultiplayerOverlay.svelte';
	import type { ActiveInteraction } from '$lib/game/interactions/InteractionSystem';
	import { MultiplayerClient } from '$lib/game/multiplayer/MultiplayerClient';
	import type { ChatEntry, ConnectionStatus, PlayerState } from '$lib/game/multiplayer/types';

	interface Props {
		authenticated: boolean;
		overlayOpen: boolean;
		onLoginRequested: () => void;
		onJobBoardRequested: () => void;
	}

	let { authenticated, overlayOpen, onLoginRequested, onJobBoardRequested }: Props = $props();
	let mountNode: HTMLDivElement;
	let world: GameWorld | null = null;
	let activeInteraction = $state<ActiveInteraction | null>(null);
	let pointerLocked = $state(false);
	let players = $state<PlayerState[]>([]);
	let messages = $state<ChatEntry[]>([]);
	let connectionStatus = $state<ConnectionStatus>('disconnected');
	let chatFocused = $state(false);
	let multiplayer: MultiplayerClient | null = null;

	onMount(() => {
		world = new GameWorld(mountNode, {
			onInteractionChange: (interaction) => (activeInteraction = interaction),
			onLoginKioskUse: onLoginRequested,
			onJobBoardUse: onJobBoardRequested,
			onPointerLockChange: (locked) => (pointerLocked = locked)
		});
		multiplayer = new MultiplayerClient(
			() => world?.getLocalTransform() ?? { position: { x: 0, y: 1.65, z: 8.15 }, rotation: 0 },
			{
				onPlayersChange: (nextPlayers, selfId) => {
					players = nextPlayers;
					world?.setRemotePlayers(nextPlayers, selfId);
				},
				onChatEntry: (entry) => (messages = [...messages.slice(-99), entry]),
				onStatusChange: (status) => (connectionStatus = status)
			}
		);
		world.setAuthenticated(authenticated);
		if (authenticated) multiplayer.start();
		return () => {
			multiplayer?.stop();
			world?.dispose();
		};
	});

	$effect(() => world?.setPaused(overlayOpen || chatFocused));
	$effect(() => world?.setAuthenticated(authenticated));
	$effect(() => {
		if (authenticated) multiplayer?.start();
		else multiplayer?.stop();
	});
</script>

<div class="viewport" bind:this={mountNode}>
	<div class="onboarding-pop" role="status" aria-label="W A S D to move. This site plays audio.">
		<div class="move-hint" aria-hidden="true">
			<span class="key-row"><kbd>W</kbd></span>
			<span class="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
			<strong>TO MOVE</strong>
		</div>
		<div class="audio-hint" aria-hidden="true">
			<svg viewBox="0 0 24 24" role="img">
				<path d="M4 14v-2a8 8 0 0 1 16 0v2" />
				<path d="M18 19h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1v6ZM6 19H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1v6Z" />
			</svg>
			<span>THIS SITE PLAYS AUDIO</span>
		</div>
	</div>

	<div class:visible={pointerLocked && !overlayOpen} class="crosshair" aria-hidden="true"></div>

	{#if activeInteraction && pointerLocked && !overlayOpen}
		<div class="interaction-prompt" aria-live="polite">{activeInteraction.prompt}</div>
	{/if}

	{#if authenticated}
		<MultiplayerOverlay
			{players}
			messages={messages}
			status={connectionStatus}
			onSendChat={(text) => multiplayer?.sendChat(text) ?? false}
			onChatFocusChange={(focused) => (chatFocused = focused)}
		/>
	{/if}

</div>

<style>
	.viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #17160d;
	}
	.viewport :global(.game-canvas) { display: block; width: 100%; height: 100%; }
	.onboarding-pop {
		position: absolute;
		z-index: 4;
		top: 50%;
		left: 50%;
		display: grid;
		gap: 1.15rem;
		justify-items: center;
		translate: -50% -50%;
		color: #fff8bd;
		filter: drop-shadow(0 3px 10px #000);
		pointer-events: none;
		animation: onboarding-pop 5s ease both;
	}
	.move-hint { display: grid; grid-template-columns: auto auto; align-items: end; gap: .45rem .8rem; }
	.key-row { display: flex; justify-content: center; gap: .25rem; }
	.key-row:first-child { grid-column: 1; }
	.key-row:nth-child(2) { grid-column: 1; }
	.move-hint strong {
		grid-column: 2;
		grid-row: 1 / 3;
		align-self: center;
		font: 700 .78rem/1 var(--font-mono);
		letter-spacing: .16em;
		white-space: nowrap;
	}
	kbd {
		display: grid;
		width: 1.9rem;
		height: 1.9rem;
		place-items: center;
		border: 1px solid rgba(255, 248, 189, .8);
		border-radius: .2rem;
		background: rgba(17, 17, 9, .78);
		box-shadow: inset 0 -2px 0 rgba(255, 248, 189, .2), 0 2px 7px rgba(0, 0, 0, .55);
		font: 700 .78rem/1 var(--font-mono);
	}
	.audio-hint { display: flex; align-items: center; gap: .55rem; }
	.audio-hint svg {
		width: 1.25rem;
		height: 1.25rem;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.7;
	}
	.audio-hint span {
		font: 500 .68rem/1 var(--font-mono);
		letter-spacing: .13em;
		white-space: nowrap;
	}
	@keyframes onboarding-pop {
		0% { opacity: 0; scale: .94; }
		10%, 66% { opacity: 1; scale: 1; }
		100% { opacity: 0; scale: 1.02; visibility: hidden; }
	}
	@media (prefers-reduced-motion: reduce) {
		.onboarding-pop { animation: onboarding-fade 5s linear both; }
		@keyframes onboarding-fade {
			0%, 70% { opacity: 1; }
			100% { opacity: 0; visibility: hidden; }
		}
	}
	.crosshair {
		position: absolute; top: 50%; left: 50%; width: 5px; height: 5px; translate: -50% -50%;
		border: 1px solid rgba(232, 225, 164, 0.85); border-radius: 50%;
		box-shadow: 0 0 8px rgba(214, 205, 132, 0.4); opacity: 0; transition: opacity 160ms ease;
		pointer-events: none;
	}
	.crosshair.visible { opacity: 1; }
	.interaction-prompt {
		position: absolute; left: 50%; bottom: 18%; translate: -50% 0; padding: 0.78rem 1.05rem;
		border: 1px solid #d8cf82; background: #111109;
		box-shadow: 0 14px 44px rgba(0, 0, 0, 0.72), 0 0 0 3px rgba(17, 17, 9, 0.7); color: #fff8bd;
		font: 700 0.75rem/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase;
		text-shadow: 0 1px 1px #000;
	}
</style>
