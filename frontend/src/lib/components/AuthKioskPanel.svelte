<script lang="ts">
	import type { AuthState } from '$lib/auth/types';

	interface Props {
		authState: AuthState;
		profileState: 'loading' | 'ready' | 'missing' | 'error';
		profileError?: string | null;
		onClose: () => void;
		onLogin: () => void | Promise<void>;
		onGoogle: () => void | Promise<void>;
		onSignUp: (username: string) => void | Promise<void>;
		onCreateProfile: (username: string) => void | Promise<void>;
		onLogout: () => void | Promise<void>;
	}

	let { authState, profileState, profileError = null, onClose, onLogin, onGoogle, onSignUp, onCreateProfile, onLogout }: Props = $props();
	let submitting = $state(false);
	let creatingAccount = $state(false);
	let username = $state('');

	async function run(action: () => void | Promise<void>) {
		submitting = true;
		try { await action(); } finally { submitting = false; }
	}

	async function submitUsername(event: SubmitEvent, action: (username: string) => void | Promise<void>) {
		event.preventDefault();
		await run(() => action(username));
	}
</script>

<div class="backdrop" role="presentation">
	<div class="panel" role="dialog" aria-modal="true" aria-labelledby="kiosk-title">
		<div class="terminal-bar">
			<span class="status-light"></span><span>THE JOB ROOMS / AUTH 01</span>
			<button class="close" onclick={onClose} aria-label="Close login terminal">×</button>
		</div>

		<div class="panel-body">
			<p class="eyebrow">Personnel access</p>
			{#if authState.status === 'authenticated' && profileState === 'ready'}
				<h1 id="kiosk-title">Welcome back.</h1>
				<div class="identity-card">
					<div class="avatar">
						{#if authState.user?.picture}<img src={authState.user.picture} alt="" />
						{:else}<span>{(authState.user?.name ?? 'P').slice(0, 1).toUpperCase()}</span>{/if}
					</div>
					<div><strong>{authState.user?.name ?? authState.user?.nickname ?? 'Authorized player'}</strong><small>{authState.user?.email ?? 'Identity verified by Auth0'}</small></div>
					<span class="pass-state">CLEARED</span>
				</div>
				<div class="actions single">
					<button class="primary" onclick={onClose}>Enter The Job Rooms</button>
					<button class="text-button" onclick={() => run(onLogout)} disabled={submitting}>Sign out</button>
				</div>
			{:else if authState.status === 'authenticated'}
				<h1 id="kiosk-title">Choose a username.</h1>
				{#if profileState === 'loading'}
					<p class="notice">Preparing your profile…</p>
				{:else}
					<form class="username-form" onsubmit={(event) => submitUsername(event, onCreateProfile)}>
						<label for="profile-username">Username</label>
						<input id="profile-username" bind:value={username} required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="night_shift" />
						<small>3–30 letters, numbers, or underscores. Permanent.</small>
						{#if profileError}<p class="error" role="alert">{profileError}</p>{/if}
						<button class="primary" type="submit" disabled={submitting}>Confirm identity</button>
					</form>
				{/if}
				<button class="text-button signout" onclick={() => run(onLogout)} disabled={submitting}>Sign out</button>
			{:else}
				<h1 id="kiosk-title"><span>The</span> Job Rooms</h1>
				<p class="lede">Sign in to begin your shift.</p>
				{#if authState.status === 'error'}<p class="error" role="alert">{authState.error}</p>{/if}
				{#if creatingAccount}
					<form class="username-form" onsubmit={(event) => submitUsername(event, onSignUp)}>
						<label for="signup-username">Choose a username</label>
						<input id="signup-username" bind:value={username} required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="night_shift" />
						<small>3–30 letters, numbers, or underscores. Permanent.</small>
						<button class="primary" type="submit" disabled={submitting || authState.status === 'loading'}>Continue</button>
						<button class="text-button" type="button" onclick={() => (creatingAccount = false)} disabled={submitting}>Back</button>
					</form>
				{:else}
					<div class="actions">
						<button class="primary" onclick={() => run(onGoogle)} disabled={submitting || authState.status === 'loading'}><span class="google-mark">G</span>Continue with Google</button>
						<button class="secondary" onclick={() => run(onLogin)} disabled={submitting || authState.status === 'loading'}>Log in with email</button>
						<button class="text-button create-account" onclick={() => (creatingAccount = true)} disabled={submitting || authState.status === 'loading'}>Create an account</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 1.25rem; background: rgba(3,3,2,.7); backdrop-filter: blur(10px) saturate(.7); }
	.panel { position: relative; width: min(29rem, 100%); overflow: hidden; border: 1px solid #77735b; border-radius: 2px; background: rgba(218,214,194,.98); box-shadow: 0 32px 100px rgba(0,0,0,.82), 0 0 0 1px rgba(255,250,207,.16) inset, 0 0 48px rgba(199,183,91,.06); color: #15150f; }
	.panel::after { position: absolute; inset: 2.7rem 0 auto; height: 1px; background: linear-gradient(90deg, transparent, rgba(225,211,123,.3), transparent); content: ''; pointer-events: none; }
	.terminal-bar { display: flex; align-items: center; gap: .6rem; min-height: 2.7rem; padding-left: 1rem; border-bottom: 1px solid rgba(220,205,111,.2); background: #0e0e0a; color: #8e8a70; font: 600 .6rem/1 var(--font-mono); letter-spacing: .12em; }
	.status-light { width: .42rem; height: .42rem; border-radius: 50%; background: #cbbd68; box-shadow: 0 0 9px rgba(219,204,109,.65); }
	.close { align-self: stretch; width: 2.8rem; margin-left: auto; border: 0; border-left: 1px solid rgba(220,205,111,.15); background: transparent; color: #8e8a70; font-size: 1.35rem; cursor: pointer; }
	.close:hover { background: rgba(229,217,137,.06); color: #fff9cf; }
	.panel-body { padding: clamp(1.75rem, 6vw, 3rem); background: linear-gradient(145deg, rgba(255,253,232,.26), transparent 58%); }
	.eyebrow { margin: 0 0 1.05rem; color: #756b32; font: 700 .62rem/1 var(--font-mono); letter-spacing: .16em; text-transform: uppercase; }
	h1 { max-width: 10em; margin: 0; font-family: var(--font-display); font-size: clamp(2.35rem,8vw,3.65rem); font-weight: 600; line-height: .9; letter-spacing: -.06em; }
	h1 span { display: block; color: #5f5d50; font-size: .46em; font-weight: 500; letter-spacing: -.02em; text-transform: uppercase; }
	.lede { margin: 1.05rem 0 2rem; color: #4f5046; font-size: .86rem; line-height: 1.5; }
	.identity-card { display: flex; align-items: center; gap: .85rem; margin: 1.65rem 0 0; padding: .9rem 1rem; border: 1px solid #aaa58c; background: rgba(255,253,232,.36); }
	.identity-card small { color: #5b5c50; }
	.identity-card strong, .identity-card small { display: block; }
	.identity-card strong { margin-bottom: .3rem; }
	.avatar { display: grid; width: 2.8rem; aspect-ratio: 1; overflow: hidden; place-items: center; border: 1px solid rgba(213,198,105,.42); border-radius: 50%; background: #1a1910; color: #d8cc7a; }
	.avatar img { width: 100%; height: 100%; object-fit: cover; }
	.pass-state { margin-left: auto; color: #6d622a; font: 800 .58rem/1 var(--font-mono); letter-spacing: .12em; }
	.actions { display: grid; gap: .65rem; }
	.actions.single { margin-top: 1.5rem; }
	button { font: inherit; }
	.actions button { min-height: 3.15rem; border-radius: 2px; font-weight: 650; cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background 120ms ease; }
	.username-form { display: grid; gap: .7rem; margin-top: 1.75rem; }
	.username-form label { color: #4b4a3d; font: 700 .64rem/1 var(--font-mono); letter-spacing: .1em; text-transform: uppercase; }
	.username-form input { min-height: 3.15rem; padding: 0 .9rem; border: 1px solid #8f8a70; border-radius: 2px; background: #f4f1df; color: #14140e; font: 600 .88rem/1 var(--font-display); outline: none; }
	.username-form input:focus { border-color: #8b7d33; box-shadow: 0 0 0 2px rgba(139,125,51,.16); }
	.username-form small { color: #5c5c50; font: 600 .6rem/1.5 var(--font-mono); }
	.username-form button { min-height: 3.15rem; border-radius: 2px; font-weight: 650; cursor: pointer; }
	.notice { padding: .85rem 1rem; border: 1px solid #aaa58c; background: rgba(255,253,232,.32); color: #4d4d42; font-size: .78rem; }
	.signout { display: block; margin: 1rem auto 0; cursor: pointer; }
	.actions button:hover:not(:disabled) { transform: translateY(-1px); }
	.actions button:disabled { cursor: wait; opacity: .48; }
	.primary { border: 1px solid #c7b957; background: #c7b957; color: #17160c; }
	.primary:hover:not(:disabled) { border-color: #d9cd79; background: #d9cd79; }
	.secondary { border: 1px solid #8c8870; background: #eeeada; color: #191911; }
	.secondary:hover:not(:disabled) { border-color: #6f6a4d; background: #f6f2df; }
	.google-mark { display: inline-grid; width: 1.35rem; aspect-ratio: 1; margin-right: .55rem; place-items: center; border-radius: 50%; background: rgba(20,20,12,.92); color: #d6c76a; font: 800 .74rem/1 Arial,sans-serif; }
	.text-button { border: 0; background: transparent; color: #5d572f; font-weight: 700; cursor: pointer; }
	.create-account { min-height: 2.2rem !important; margin-top: .1rem; }
	.error { padding: .75rem; border: 1px solid #b66e68; background: #f3d9d4; color: #6e1f1a; font-size: .78rem; }
	@media (max-width: 420px) { .panel-body { padding: 1.6rem 1.35rem 1.8rem; } h1 { font-size: 2.8rem; } }
</style>
