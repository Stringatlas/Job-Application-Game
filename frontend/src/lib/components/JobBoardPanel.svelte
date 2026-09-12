<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ApiError,
		createJobListing,
		getMyProfile,
		listJobListings,
		saveMyProfile
	} from '$lib/api/client';
	import type { JobListing, JobListingCreate } from '$lib/api/types';

	interface Props {
		suggestedDisplayName?: string | null;
		onClose: () => void;
	}

	let { suggestedDisplayName = null, onClose }: Props = $props();
	let view = $state<'browse' | 'post'>('browse');
	let jobs = $state<JobListing[]>([]);
	let jobsLoading = $state(true);
	let jobsError = $state<string | null>(null);
	let profileState = $state<'loading' | 'ready' | 'missing'>('loading');
	let username = $state('');
	let title = $state('');
	let company = $state('');
	let location = $state('');
	let remote = $state(false);
	let externalUrl = $state('');
	let description = $state('');
	let tags = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let postedTitle = $state<string | null>(null);

	onMount(() => {
		void loadProfile();
		void loadJobs();
	});

	async function loadProfile(): Promise<void> {
		try {
			const profile = await getMyProfile();
			if (profile) {
				username = profile.username;
				profileState = 'ready';
			} else {
				profileState = 'missing';
			}
		} catch (loadError) {
			error = readableError(loadError);
			profileState = 'missing';
		}
	}

	async function loadJobs(): Promise<void> {
		jobsLoading = true;
		jobsError = null;
		try {
			jobs = await listJobListings();
		} catch (loadError) {
			jobsError = readableError(loadError);
		} finally {
			jobsLoading = false;
		}
	}

	function readableError(problem: unknown): string {
		if (problem instanceof ApiError && problem.status === 429) {
			const minutes = Math.max(1, Math.ceil((problem.retryAfterSeconds ?? 60) / 60));
			return `Posting limit reached. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
		}
		if (problem instanceof ApiError && problem.status === 401) {
			return 'Your session expired. Close the board and sign in again.';
		}
		return problem instanceof Error ? problem.message : 'The listing could not be posted.';
	}

	function resetListing(): void {
		title = '';
		company = '';
		location = '';
		remote = false;
		externalUrl = '';
		description = '';
		tags = '';
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = null;
		postedTitle = null;
		submitting = true;
		try {
			if (profileState === 'missing') {
				await saveMyProfile(username, suggestedDisplayName?.slice(0, 80) ?? null);
				profileState = 'ready';
			}

			const listing: JobListingCreate = {
				title,
				company,
				location,
				remote,
				external_url: externalUrl,
				description: description.trim() || null,
				tags: tags
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			};
			const posted = await createJobListing(listing);
			postedTitle = posted.title;
			jobs = [posted, ...jobs];
			resetListing();
			view = 'browse';
		} catch (submitError) {
			error = readableError(submitError);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && !submitting && onClose()} />

<div class="backdrop" role="presentation">
	<div class="board" role="dialog" aria-modal="true" aria-labelledby="job-board-title">
		<header class="board-header">
			<div>
				<p>Office network / submissions</p>
				<h1 id="job-board-title">Job Board</h1>
			</div>
			<button class="close" type="button" onclick={onClose} disabled={submitting} aria-label="Close job board">×</button>
		</header>
		<nav class="board-tabs" aria-label="Job board views">
			<button class:active={view === 'browse'} type="button" onclick={() => (view = 'browse')}>Listings <span>{jobs.length}</span></button>
			<button class:active={view === 'post'} type="button" onclick={() => (view = 'post')}>Post a listing</button>
		</nav>

		{#if view === 'browse'}
			<div class="listing-view">
				{#if postedTitle}<p class="success" role="status"><strong>{postedTitle}</strong> is now on the board.</p>{/if}
				{#if jobsLoading}
					<p class="empty-state">Reading the board…</p>
				{:else if jobsError}
					<div class="empty-state"><p>{jobsError}</p><button type="button" onclick={loadJobs}>Try again</button></div>
				{:else if jobs.length === 0}
					<div class="empty-state"><p>Nothing has been pinned here yet.</p><button type="button" onclick={() => (view = 'post')}>Post the first listing</button></div>
				{:else}
					<div class="listings">
						{#each jobs as job (job.id)}
							<article class="listing-card">
								<div class="listing-copy">
									<p>{job.company}</p>
									<h2>{job.title}</h2>
									<div class="metadata"><span>{job.location}</span>{#if job.remote}<span>Remote</span>{/if}</div>
									{#if job.description}<p class="description">{job.description}</p>{/if}
									{#if job.tags.length}<div class="tags">{#each job.tags as tag}<span>{tag}</span>{/each}</div>{/if}
								</div>
								<a href={job.external_url} target="_blank" rel="noopener noreferrer">Apply <span aria-hidden="true">↗</span></a>
							</article>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
		<form onsubmit={submit}>
			<p class="intro">Share a direct employer listing with everyone in the office.</p>

			{#if profileState === 'loading'}
				<p class="notice">Loading your player profile…</p>
			{:else}
				{#if profileState === 'missing'}
					<label class="full">
						<span>Choose your username <small>Required once</small></span>
						<input bind:value={username} required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="campus_recruit" />
					</label>
				{/if}

				<div class="fields">
					<label>
						<span>Role</span>
						<input bind:value={title} required maxlength="120" placeholder="Software Engineer Intern" />
					</label>
					<label>
						<span>Company</span>
						<input bind:value={company} required maxlength="120" placeholder="Roblox" />
					</label>
					<label>
						<span>Location</span>
						<input bind:value={location} required maxlength="120" placeholder="San Mateo, CA or Remote" />
					</label>
					<label class="remote-toggle">
						<input type="checkbox" bind:checked={remote} />
						<span>Remote-friendly</span>
					</label>
					<label class="full">
						<span>Employer application URL</span>
						<input type="url" bind:value={externalUrl} required maxlength="2048" pattern="https://.*" title="Use a secure https:// URL" placeholder="https://company.com/careers/job" />
					</label>
					<label class="full">
						<span>Description <small>Optional</small></span>
						<textarea bind:value={description} maxlength="5000" rows="4" placeholder="A short, plain-text summary of the role"></textarea>
					</label>
					<label class="full">
						<span>Tags <small>Optional, comma-separated</small></span>
						<input bind:value={tags} maxlength="400" placeholder="internship, software, summer-2027" />
					</label>
				</div>

				{#if error}<p class="error" role="alert">{error}</p>{/if}
				<footer>
					<p>Limit: 5 submissions per hour</p>
					<div>
						<button class="secondary" type="button" onclick={onClose} disabled={submitting}>Cancel</button>
						<button class="primary" type="submit" disabled={submitting}>{submitting ? 'Posting…' : 'Post listing'}</button>
					</div>
				</footer>
			{/if}
		</form>
		{/if}
	</div>
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 1.25rem; background: rgba(1,4,3,.68); backdrop-filter: blur(9px); }
	.board { width: min(48rem, 100%); max-height: calc(100dvh - 2.5rem); overflow: auto; border: 1px solid rgba(141,255,201,.27); border-radius: 2px; background: rgba(10,15,13,.98); box-shadow: 0 32px 100px rgba(0,0,0,.72), 0 0 60px rgba(77,255,168,.06); color: #eef8f2; }
	.board-header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; min-height: 5.4rem; padding: 1rem 1.25rem 1rem 1.5rem; border-bottom: 1px solid rgba(141,255,201,.15); background: rgba(12,18,16,.98); }
	.board-header p { margin: 0 0 .4rem; color: #7ef0b4; font: 600 .58rem/1 var(--font-mono); letter-spacing: .13em; text-transform: uppercase; }
	h1 { margin: 0; font-family: var(--font-display); font-size: 1.65rem; letter-spacing: -.035em; }
	.close { width: 2.6rem; aspect-ratio: 1; border: 1px solid rgba(255,255,255,.1); background: transparent; color: #8ca197; font-size: 1.35rem; cursor: pointer; }
	.board-tabs { position: sticky; top: 5.4rem; z-index: 1; display: flex; border-bottom: 1px solid rgba(141,255,201,.12); background: rgba(12,18,16,.98); }
	.board-tabs button { flex: 1; min-height: 3rem; border: 0; border-right: 1px solid rgba(255,255,255,.07); background: transparent; color: #73847a; font: 600 .63rem/1 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
	.board-tabs button.active { box-shadow: inset 0 -2px #b7ad69; color: #ded79d; }
	.board-tabs span { display: inline-grid; min-width: 1.3rem; min-height: 1.3rem; margin-left: .35rem; place-items: center; border-radius: 50%; background: rgba(255,255,255,.07); font-size: .56rem; }
	form { padding: clamp(1.25rem, 4vw, 2rem); }
	.listing-view { padding: clamp(1.25rem, 4vw, 2rem); }
	.listings { display: grid; gap: .75rem; }
	.listing-card { display: flex; align-items: center; gap: 1rem; padding: 1.1rem; border: 1px solid rgba(211,203,137,.15); background: #121610; }
	.listing-copy { min-width: 0; flex: 1; }
	.listing-copy > p:first-child { margin: 0 0 .35rem; color: #8e8a61; font: 600 .58rem/1 var(--font-mono); letter-spacing: .1em; text-transform: uppercase; }
	.listing-card h2 { margin: 0; color: #e5e1bd; font-size: 1rem; line-height: 1.3; }
	.metadata, .tags { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .65rem; }
	.metadata span, .tags span { padding: .25rem .4rem; background: rgba(198,191,126,.08); color: #929071; font: 500 .55rem/1 var(--font-mono); text-transform: uppercase; }
	.description { display: -webkit-box; overflow: hidden; margin: .7rem 0 0; color: #8f9a8f; font-size: .75rem; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
	.listing-card > a { flex: 0 0 auto; padding: .7rem .8rem; border: 1px solid rgba(211,203,137,.28); color: #d9d199; font: 600 .65rem/1 var(--font-mono); text-decoration: none; text-transform: uppercase; }
	.listing-card > a:hover { border-color: #d9d199; background: rgba(211,203,137,.07); }
	.empty-state { display: grid; min-height: 13rem; place-content: center; justify-items: center; gap: .75rem; margin: 0; color: #7f897f; font-size: .82rem; text-align: center; }
	.empty-state p { margin: 0; }
	.empty-state button { padding: .65rem .8rem; border: 1px solid rgba(211,203,137,.25); background: transparent; color: #d9d199; cursor: pointer; }
	.intro { margin: 0 0 1.5rem; color: #9aaca2; font-size: .88rem; }
	.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	label { display: grid; align-content: start; gap: .48rem; }
	label.full { grid-column: 1 / -1; margin-bottom: 1rem; }
	label span { color: #b7c8bf; font: 600 .64rem/1 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; }
	label small { color: #68786f; font: inherit; }
	input, textarea { width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 2px; background: #0c1210; color: #eef8f2; font: 500 .82rem/1.4 var(--font-display); outline: none; }
	input { min-height: 2.9rem; padding: 0 .85rem; }
	textarea { resize: vertical; min-height: 6rem; padding: .75rem .85rem; }
	input:focus, textarea:focus { border-color: rgba(126,240,180,.65); box-shadow: 0 0 0 2px rgba(126,240,180,.08); }
	.remote-toggle { display: flex; align-items: center; gap: .6rem; min-height: 2.9rem; padding-top: 1.45rem; }
	.remote-toggle input { width: 1rem; min-height: auto; accent-color: #82eab7; }
	.notice, .error, .success { padding: .85rem 1rem; border: 1px solid rgba(255,255,255,.09); font-size: .78rem; line-height: 1.5; }
	.notice { color: #91a49a; }
	.error { border-color: rgba(255,116,116,.24); background: rgba(117,31,31,.14); color: #ffb0b0; }
	.success { border-color: rgba(126,240,180,.26); background: rgba(55,138,94,.12); color: #a8f6ce; }
	footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(255,255,255,.08); }
	footer p { margin: 0; color: #64746b; font: 500 .6rem/1.4 var(--font-mono); text-transform: uppercase; }
	footer div { display: flex; gap: .65rem; }
	footer button { min-height: 2.8rem; padding: 0 1.15rem; border-radius: 2px; font: 650 .78rem/1 var(--font-display); cursor: pointer; }
	.primary { border: 1px solid #86ebbb; background: #86ebbb; color: #07100b; }
	.secondary { border: 1px solid rgba(255,255,255,.13); background: rgba(255,255,255,.04); color: #edf5f0; }
	button:disabled { cursor: wait; opacity: .5; }
	@media (max-width: 620px) {
		.backdrop { padding: .5rem; }
		.board { max-height: calc(100dvh - 1rem); }
		.fields { grid-template-columns: 1fr; }
		.full { grid-column: auto; }
		.remote-toggle { padding-top: 0; }
		footer { align-items: stretch; flex-direction: column; }
		footer div, footer button { flex: 1; }
		.listing-card { align-items: stretch; flex-direction: column; }
		.listing-card > a { text-align: center; }
	}
</style>
