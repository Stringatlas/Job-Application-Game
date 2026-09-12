<script lang="ts">
	import { onMount } from 'svelte';
	import AuthKioskPanel from '$lib/components/AuthKioskPanel.svelte';
	import GameViewport from '$lib/components/GameViewport.svelte';
	import JobBoardPanel from '$lib/components/JobBoardPanel.svelte';
	import { ApiError, createMyProfile, getMyProfile } from '$lib/api/client';
	import { auth } from '$lib/auth/auth-store';

	let kioskOpen = $state(false);
	let jobBoardOpen = $state(false);
	let profileState = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let profileError = $state<string | null>(null);

	function openJobBoard(): void {
		if ($auth.status === 'authenticated' && profileState === 'ready') jobBoardOpen = true;
		else kioskOpen = true;
	}

	function displayName(): string | null {
		const name = ($auth.user?.name ?? $auth.user?.nickname ?? '').trim();
		return name ? name.slice(0, 80) : null;
	}

	async function createProfile(username: string): Promise<void> {
		profileState = 'loading';
		profileError = null;
		try {
			await createMyProfile(username, displayName());
			auth.clearPendingUsername();
			profileState = 'ready';
			kioskOpen = false;
		} catch (error) {
			profileState = 'error';
			profileError = error instanceof Error ? error.message : 'Player profile creation failed';
			kioskOpen = true;
		}
	}

	async function initialize(): Promise<void> {
		await auth.initialize();
		if ($auth.status !== 'authenticated') {
			profileState = 'missing';
			return;
		}

		try {
			const profile = await getMyProfile();
			if (profile) {
				auth.clearPendingUsername();
				profileState = 'ready';
				return;
			}

			const pendingUsername = auth.getPendingUsername();
			if (pendingUsername) {
				await createProfile(pendingUsername);
			} else {
				profileState = 'missing';
				kioskOpen = true;
			}
		} catch (error) {
			profileState = 'error';
			profileError = error instanceof ApiError ? error.message : 'Could not load your player profile';
			kioskOpen = true;
		}
	}

	onMount(() => void initialize());
</script>

<svelte:head>
	<title>The Job Rooms</title>
	<meta name="description" content="Explore a multiplayer office and discover jobs with other players." />
</svelte:head>

<main>
	<GameViewport
		authenticated={$auth.status === 'authenticated' && profileState === 'ready'}
		overlayOpen={kioskOpen || jobBoardOpen}
		onLoginRequested={() => (kioskOpen = true)}
		onJobBoardRequested={openJobBoard}
	/>

	{#if kioskOpen}
		<AuthKioskPanel
			authState={$auth}
			{profileState}
			{profileError}
			onClose={() => (kioskOpen = false)}
			onLogin={() => auth.login()}
			onGoogle={() => auth.loginWithGoogle()}
			onSignUp={(username) => auth.signUp(username)}
			onCreateProfile={createProfile}
			onLogout={() => auth.logout()}
		/>
	{/if}

	{#if jobBoardOpen}
		<JobBoardPanel onClose={() => (jobBoardOpen = false)} />
	{/if}
</main>

<style>
	main { position: relative; width: 100vw; height: 100dvh; background: #17160d; }
</style>
