<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { AuthState } from '$lib/auth/types';

	interface Props {
		authState: AuthState;
		onClose: () => void;
		onLogin: () => void | Promise<void>;
		onGoogle: () => void | Promise<void>;
		onSignUp: () => void | Promise<void>;
		onLogout: () => void | Promise<void>;
	}

	let { authState, onClose, onLogin, onGoogle, onSignUp, onLogout }: Props = $props();
	let submitting = $state(false);
	let accidentalCloseTimer: ReturnType<typeof setTimeout> | null = null; // closes the panel unless the cursor engages it quickly (mis-press E while walking under pointer lock)
	function scheduleAccidentalClose(): void {
		if (accidentalCloseTimer) clearTimeout(accidentalCloseTimer);
		accidentalCloseTimer = setTimeout(() => { accidentalCloseTimer = null; onClose(); }, 220);
	}
	function cancelAccidentalClose(): void {
		if (accidentalCloseTimer) clearTimeout(accidentalCloseTimer);
		accidentalCloseTimer = null;
	}
	onMount(scheduleAccidentalClose);
	onDestroy(cancelAccidentalClose);

	async function run(action: () => void | Promise<void>) {
		submitting = true;
		try { await action(); } finally { submitting = false; }
	}
</script>

<div class="backdrop" role="presentation" onmouseenter={cancelAccidentalClose}>
	<div class="panel" role="dialog" aria-modal="true" aria-labelledby="kiosk-title">
		<div class="terminal-bar">
			<span class="status-light"></span><span>JAG / ACCESS TERMINAL 01</span>
			<button class="close" onclick={onClose} aria-label="Close login terminal">×</button>
		</div>

		<div class="panel-body">
			<p class="eyebrow">Employee authorization</p>
			{#if authState.status === 'authenticated'}
				<h1 id="kiosk-title">Access granted.</h1>
				<p class="lede">Your player pass is active. Multiplayer services can now connect.</p>
				<div class="identity-card">
					<div class="avatar">
						{#if authState.user?.picture}<img src={authState.user.picture} alt="" />
						{:else}<span>{(authState.user?.name ?? 'P').slice(0, 1).toUpperCase()}</span>{/if}
					</div>
					<div><strong>{authState.user?.name ?? authState.user?.nickname ?? 'Authorized player'}</strong><small>{authState.user?.email ?? 'Identity verified by Auth0'}</small></div>
					<span class="pass-state">ACTIVE</span>
				</div>
				<div class="actions single">
					<button class="primary" onclick={onClose}>Return to office</button>
					<button class="text-button" onclick={() => run(onLogout)} disabled={submitting}>Sign out</button>
				</div>
			{:else}
				<h1 id="kiosk-title">Check in to enter the network.</h1>
				<p class="lede">Authentication activates your player identity, multiplayer presence, chat, and job board access.</p>
				<div class="guest-badge"><span>Current status</span><strong>Local guest · Offline</strong></div>
				{#if authState.status === 'error'}<p class="error" role="alert">{authState.error}</p>{/if}
				<div class="actions">
					<button class="google" onclick={() => run(onGoogle)} disabled={submitting || authState.status === 'loading'}><span class="google-mark">G</span>Continue with Google</button>
					<button class="primary" onclick={() => run(onLogin)} disabled={submitting || authState.status === 'loading'}>Log in with email</button>
					<button class="secondary" onclick={() => run(onSignUp)} disabled={submitting || authState.status === 'loading'}>Create player account</button>
				</div>
				<p class="privacy">Credentials are handled by Auth0. The game never receives your password.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 1.25rem; background: rgba(1,4,3,.58); backdrop-filter: blur(3px); }
	.panel { width: min(33rem, 100%); overflow: hidden; border: 1px solid rgba(141,255,201,.27); border-radius: 2px; background: rgba(10,15,13,.97); box-shadow: 0 32px 100px rgba(0,0,0,.72), 0 0 60px rgba(77,255,168,.06); color: #eef8f2; }
	.terminal-bar { display: flex; align-items: center; gap: .6rem; min-height: 2.7rem; padding-left: 1rem; border-bottom: 1px solid rgba(141,255,201,.15); background: #0c1210; color: #82958b; font: 600 .62rem/1 var(--font-mono); letter-spacing: .1em; }
	.status-light { width: .45rem; height: .45rem; border-radius: 50%; background: #76f8bb; box-shadow: 0 0 10px #76f8bb; }
	.close { align-self: stretch; width: 2.8rem; margin-left: auto; border: 0; border-left: 1px solid rgba(141,255,201,.12); background: transparent; color: #8ca197; font-size: 1.35rem; cursor: pointer; }
	.close:hover { background: rgba(255,255,255,.04); color: white; }
	.panel-body { padding: clamp(1.5rem, 5vw, 2.75rem); }
	.eyebrow { margin: 0 0 1rem; color: #7ef0b4; font: 600 .66rem/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; }
	h1 { max-width: 10em; margin: 0; font-family: var(--font-display); font-size: clamp(2rem,6vw,3.2rem); font-weight: 600; line-height: .98; letter-spacing: -.045em; }
	.lede { margin: 1.2rem 0 1.8rem; color: #9aaca2; font-size: .92rem; line-height: 1.65; }
	.guest-badge, .identity-card { display: flex; align-items: center; gap: .85rem; margin-bottom: 1.5rem; padding: .9rem 1rem; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.025); }
	.guest-badge { justify-content: space-between; font: 500 .68rem/1 var(--font-mono); }
	.guest-badge span, .identity-card small { color: #718078; }
	.guest-badge strong { color: #d6a87b; font-weight: 600; }
	.identity-card strong, .identity-card small { display: block; }
	.identity-card strong { margin-bottom: .3rem; }
	.avatar { display: grid; width: 2.8rem; aspect-ratio: 1; overflow: hidden; place-items: center; border: 1px solid rgba(126,240,180,.35); border-radius: 50%; background: #15231c; color: #8ff5be; }
	.avatar img { width: 100%; height: 100%; object-fit: cover; }
	.pass-state { margin-left: auto; color: #80edb5; font: 700 .62rem/1 var(--font-mono); letter-spacing: .12em; }
	.actions { display: grid; gap: .65rem; }
	.actions.single { margin-top: 1.5rem; }
	button { font: inherit; }
	.actions button { min-height: 3.15rem; border-radius: 2px; font-weight: 650; cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background 120ms ease; }
	.actions button:hover:not(:disabled) { transform: translateY(-1px); }
	.actions button:disabled { cursor: wait; opacity: .48; }
	.primary { border: 1px solid #86ebbb; background: #86ebbb; color: #07100b; }
	.primary:hover:not(:disabled) { background: #a1f7cd; }
	.google, .secondary { border: 1px solid rgba(255,255,255,.13); background: rgba(255,255,255,.045); color: #edf5f0; }
	.google-mark { display: inline-grid; width: 1.4rem; aspect-ratio: 1; margin-right: .55rem; place-items: center; border-radius: 50%; background: #fff; color: #4285f4; font: 800 .78rem/1 Arial,sans-serif; }
	.text-button { border: 0; background: transparent; color: #7f9187; }
	.privacy { margin: 1.25rem 0 0; color: #65736c; font: 500 .62rem/1.55 var(--font-mono); text-align: center; }
	.error { padding: .75rem; border: 1px solid rgba(255,116,116,.22); background: rgba(117,31,31,.14); color: #ffb0b0; font-size: .78rem; }
</style>
