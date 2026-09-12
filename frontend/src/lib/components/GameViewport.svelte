<script lang="ts">
	import { onMount } from 'svelte';
	import { GameWorld } from '$lib/game/GameWorld';
	import type { ActiveInteraction } from '$lib/game/interactions/InteractionSystem';

	interface Props {
		authenticated: boolean;
		overlayOpen: boolean;
		onLoginRequested: () => void;
	}

	let { authenticated, overlayOpen, onLoginRequested }: Props = $props();
	let mountNode: HTMLDivElement;
	let world: GameWorld | null = null;
	let activeInteraction = $state<ActiveInteraction | null>(null);
	let pointerLocked = $state(false);

	onMount(() => {
		world = new GameWorld(mountNode, {
			onInteractionChange: (interaction) => (activeInteraction = interaction),
			onLoginKioskUse: onLoginRequested,
			onPointerLockChange: (locked) => (pointerLocked = locked)
		});
		world.setAuthenticated(authenticated);
		return () => world?.dispose();
	});

	$effect(() => world?.setPaused(overlayOpen));
	$effect(() => world?.setAuthenticated(authenticated));
</script>

<div class="viewport" bind:this={mountNode}>
	<div class:visible={pointerLocked && !overlayOpen} class="crosshair" aria-hidden="true"></div>

	{#if activeInteraction && pointerLocked && !overlayOpen}
		<div class="interaction-prompt" aria-live="polite">{activeInteraction.prompt}</div>
	{/if}

	{#if !pointerLocked && !overlayOpen}
		<button class="enter-prompt" onclick={() => world?.requestPointerLock()}>
			<span>Enter the office</span>
			<small>Click to capture the mouse · WASD to move · E to interact</small>
		</button>
	{/if}

	<div class="controls-hint">WASD &nbsp; MOVE <span>·</span> SHIFT &nbsp; SPRINT <span>·</span> ESC &nbsp; RELEASE</div>
</div>

<style>
	.viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #050607;
	}
	.viewport :global(.game-canvas) { display: block; width: 100%; height: 100%; }
	.crosshair {
		position: absolute; top: 50%; left: 50%; width: 5px; height: 5px; translate: -50% -50%;
		border: 1px solid rgba(210, 255, 233, 0.85); border-radius: 50%;
		box-shadow: 0 0 8px rgba(115, 255, 194, 0.45); opacity: 0; transition: opacity 160ms ease;
		pointer-events: none;
	}
	.crosshair.visible { opacity: 1; }
	.interaction-prompt {
		position: absolute; left: 50%; bottom: 18%; translate: -50% 0; padding: 0.72rem 1rem;
		border: 1px solid rgba(132, 255, 199, 0.38); background: rgba(5, 12, 9, 0.78);
		box-shadow: 0 14px 44px rgba(0, 0, 0, 0.35); color: #c7ffe4;
		font: 600 0.75rem/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase;
		backdrop-filter: blur(12px);
	}
	.enter-prompt {
		position: absolute; inset: 0; display: grid; place-content: center; gap: 0.7rem; width: 100%; border: 0;
		background: radial-gradient(circle at center, transparent 0%, rgba(2, 3, 3, 0.38) 100%);
		color: #eef8f2; font: inherit; cursor: pointer;
	}
	.enter-prompt span { font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 3.8rem); letter-spacing: -0.035em; }
	.enter-prompt small {
		color: #91a49a; font: 500 0.68rem/1.4 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;
	}
	.controls-hint {
		position: absolute; left: 1.25rem; bottom: 1rem; color: rgba(187, 205, 195, 0.55);
		font: 500 0.58rem/1 var(--font-mono); letter-spacing: 0.1em; pointer-events: none;
	}
	.controls-hint span { color: rgba(117, 255, 189, 0.45); }
	@media (max-width: 640px) { .controls-hint { display: none; } }
</style>
