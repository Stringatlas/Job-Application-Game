<script lang="ts">
	import { onMount } from 'svelte';
	import { GameWorld } from '$lib/game/GameWorld';
	import type { ActiveInteraction } from '$lib/game/interactions/InteractionSystem';

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

	onMount(() => {
		world = new GameWorld(mountNode, {
			onInteractionChange: (interaction) => (activeInteraction = interaction),
			onLoginKioskUse: onLoginRequested,
			onJobBoardUse: onJobBoardRequested,
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

</div>

<style>
	.viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #17160d;
	}
	.viewport :global(.game-canvas) { display: block; width: 100%; height: 100%; }
	.crosshair {
		position: absolute; top: 50%; left: 50%; width: 5px; height: 5px; translate: -50% -50%;
		border: 1px solid rgba(232, 225, 164, 0.85); border-radius: 50%;
		box-shadow: 0 0 8px rgba(214, 205, 132, 0.4); opacity: 0; transition: opacity 160ms ease;
		pointer-events: none;
	}
	.crosshair.visible { opacity: 1; }
	.interaction-prompt {
		position: absolute; left: 50%; bottom: 18%; translate: -50% 0; padding: 0.78rem 1.05rem;
		animation: prompt-in 180ms ease;
		border: 1px solid #d8cf82; background: #111109;
		box-shadow: 0 14px 44px rgba(0, 0, 0, 0.72), 0 0 0 3px rgba(17, 17, 9, 0.7); color: #fff8bd;
		font: 700 0.75rem/1 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase;
		text-shadow: 0 1px 1px #000;
	}
</style>
