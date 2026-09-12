<script lang="ts">
	import { onMount } from 'svelte';
	import AuthKioskPanel from '$lib/components/AuthKioskPanel.svelte';
	import GameViewport from '$lib/components/GameViewport.svelte';
	import { auth } from '$lib/auth/auth-store';

	let kioskOpen = $state(false);
	onMount(() => void auth.initialize());
</script>

<svelte:head>
	<title>Job Application Game</title>
	<meta name="description" content="Explore a multiplayer office and discover jobs with other players." />
</svelte:head>

<main>
	<GameViewport
		authenticated={$auth.status === 'authenticated'}
		overlayOpen={kioskOpen}
		onLoginRequested={() => (kioskOpen = true)}
	/>

	<header class="hud-header">
		<a class="brand" href="/" aria-label="Job Application Game home">
			<span class="brand-mark">JAG</span><span>Job Application Game</span>
		</a>
		<div class:online={$auth.status === 'authenticated'} class="player-state">
			<span class="state-dot"></span>
			{#if $auth.status === 'authenticated'}
				{$auth.user?.name ?? $auth.user?.nickname ?? 'Player online'}
			{:else if $auth.status === 'loading'}
				Checking credentials
			{:else}
				Guest · Offline
			{/if}
		</div>
	</header>

	<div class="objective">
		<span>Current objective</span>
		<strong>{$auth.status === 'authenticated' ? 'Enter the office' : 'Find the access terminal'}</strong>
	</div>

	{#if kioskOpen}
		<AuthKioskPanel
			authState={$auth}
			onClose={() => (kioskOpen = false)}
			onLogin={() => auth.login()}
			onGoogle={() => auth.loginWithGoogle()}
			onSignUp={() => auth.signUp()}
			onLogout={() => auth.logout()}
		/>
	{/if}
</main>

<style>
	main { position: relative; width: 100vw; height: 100dvh; background: #050607; }
	.hud-header { position: absolute; top: 0; left: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 1rem 1.25rem; pointer-events: none; }
	.brand { display: flex; align-items: center; gap: .7rem; color: rgba(235,245,239,.82); font: 600 .66rem/1 var(--font-mono); letter-spacing: .08em; text-decoration: none; text-transform: uppercase; pointer-events: auto; }
	.brand-mark { display: grid; width: 2.2rem; aspect-ratio: 1; place-items: center; border: 1px solid rgba(133,245,190,.45); color: #8ff3bd; font-size: .62rem; }
	.player-state { display: flex; align-items: center; gap: .55rem; min-height: 2.2rem; padding: 0 .8rem; border: 1px solid rgba(255,255,255,.1); border-radius: 999px; background: rgba(5,8,7,.64); color: #9ca9a2; font: 500 .62rem/1 var(--font-mono); letter-spacing: .04em; backdrop-filter: blur(8px); }
	.state-dot { width: .42rem; height: .42rem; border-radius: 50%; background: #bf855a; box-shadow: 0 0 8px rgba(191,133,90,.5); }
	.player-state.online .state-dot { background: #75ecad; box-shadow: 0 0 8px rgba(117,236,173,.6); }
	.objective { position: absolute; top: 5.2rem; left: 1.25rem; z-index: 4; display: grid; gap: .35rem; padding-left: .75rem; border-left: 1px solid rgba(126,240,180,.42); pointer-events: none; }
	.objective span { color: #718078; font: 500 .55rem/1 var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
	.objective strong { color: rgba(226,237,231,.82); font-size: .78rem; font-weight: 550; }
	@media (max-width: 640px) {
		.hud-header { padding: .8rem; }
		.brand > span:last-child { display: none; }
		.objective { top: 4.5rem; left: .8rem; }
	}
</style>
