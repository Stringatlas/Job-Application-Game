<script lang="ts">
	import { onMount } from 'svelte';
	import AuthKioskPanel from '$lib/components/AuthKioskPanel.svelte';
	import GameViewport from '$lib/components/GameViewport.svelte';
	import JobBoardPanel from '$lib/components/JobBoardPanel.svelte';
	import { auth } from '$lib/auth/auth-store';

	let kioskOpen = $state(false);
	let jobBoardOpen = $state(false);

	function openJobBoard(): void {
		if ($auth.status === 'authenticated') jobBoardOpen = true;
		else kioskOpen = true;
	}

	onMount(() => void auth.initialize());
</script>

<svelte:head>
	<title>Job Application Game</title>
	<meta name="description" content="Explore a multiplayer office and discover jobs with other players." />
</svelte:head>

<main>
	<GameViewport
		authenticated={$auth.status === 'authenticated'}
		overlayOpen={kioskOpen || jobBoardOpen}
		onLoginRequested={() => (kioskOpen = true)}
		onJobBoardRequested={openJobBoard}
	/>

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

	{#if jobBoardOpen}
		<JobBoardPanel
			suggestedDisplayName={$auth.user?.name ?? $auth.user?.nickname}
			onClose={() => (jobBoardOpen = false)}
		/>
	{/if}
</main>

<style>
	main { position: relative; width: 100vw; height: 100dvh; background: #17160d; }
</style>
