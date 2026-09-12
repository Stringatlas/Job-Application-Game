<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ApiError,
		createJobListing,
		deleteJobListing,
		getMyJobRating,
		listMyJobApplications,
		listJobListings,
		listMyJobListings,
		rateJobListing,
		recordJobApplication,
		updateJobListing
	} from '$lib/api/client';
	import type { JobApplication, JobListing, JobListingCreate } from '$lib/api/types';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();
	let view = $state<'browse' | 'mine' | 'post'>('browse');
	let jobs = $state<JobListing[]>([]);
	let myJobs = $state<JobListing[]>([]);
	let jobsLoading = $state(true);
	let myJobsLoading = $state(true);
	let jobsError = $state<string | null>(null);
	let myJobsError = $state<string | null>(null);
	let applicationsError = $state<string | null>(null);
	let applicationsByJob = $state<Record<string, JobApplication>>({});
	let applyingJobIds = $state<string[]>([]);
	let title = $state('');
	let company = $state('');
	let location = $state('');
	let remote = $state(false);
	let externalUrl = $state('');
	let description = $state('');
	let tags = $state('');
	let submitting = $state(false);
	let deletingId = $state<string | null>(null);
	let editingJobId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let ratingJob = $state<JobListing | null>(null);
	let ratingStars = $state(0);
	let ratingStale = $state(false);
	let ratingLoading = $state(false);
	let ratingSubmitting = $state(false);
	let ratingError = $state<string | null>(null);

	onMount(() => {
		void loadJobs();
		void loadMyJobs();
		void loadApplications();
	});

	async function loadApplications(): Promise<void> {
		applicationsError = null;
		try {
			const applications = await listMyJobApplications();
			applicationsByJob = {
				...Object.fromEntries(
					applications.map((application) => [application.job_listing_id, application])
				),
				...applicationsByJob
			};
		} catch (loadError) {
			applicationsError = readableError(loadError);
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

	async function loadMyJobs(): Promise<void> {
		myJobsLoading = true;
		myJobsError = null;
		try {
			myJobs = await listMyJobListings();
		} catch (loadError) {
			myJobsError = readableError(loadError);
		} finally {
			myJobsLoading = false;
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
		return problem instanceof Error ? problem.message : 'The listing request could not be completed.';
	}

	function resetListing(): void {
		title = '';
		company = '';
		location = '';
		remote = false;
		externalUrl = '';
		description = '';
		tags = '';
		editingJobId = null;
	}

	function startNewListing(): void {
		resetListing();
		error = null;
		successMessage = null;
		view = 'post';
	}

	function startEditing(job: JobListing): void {
		editingJobId = job.id;
		title = job.title;
		company = job.company;
		location = job.location;
		remote = job.remote;
		externalUrl = job.external_url;
		description = job.description ?? '';
		tags = job.tags.join(', ');
		error = null;
		successMessage = null;
		view = 'post';
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = null;
		successMessage = null;
		submitting = true;
		try {
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
			if (editingJobId) {
				const updated = await updateJobListing(editingJobId, listing);
				jobs = jobs.map((job) => (job.id === updated.id ? updated : job));
				myJobs = myJobs.map((job) => (job.id === updated.id ? updated : job));
				successMessage = `${updated.title} was updated.`;
				view = 'mine';
			} else {
				const posted = await createJobListing(listing);
				jobs = [posted, ...jobs];
				myJobs = [posted, ...myJobs];
				successMessage = `${posted.title} is now on the board.`;
				view = 'browse';
			}
			resetListing();
		} catch (submitError) {
			error = readableError(submitError);
		} finally {
			submitting = false;
		}
	}

	async function removeJob(job: JobListing): Promise<void> {
		if (!confirm(`Delete “${job.title}”? This cannot be undone.`)) return;
		deletingId = job.id;
		myJobsError = null;
		successMessage = null;
		try {
			await deleteJobListing(job.id);
			jobs = jobs.filter((listing) => listing.id !== job.id);
			myJobs = myJobs.filter((listing) => listing.id !== job.id);
			successMessage = `${job.title} was deleted.`;
		} catch (deleteError) {
			myJobsError = readableError(deleteError);
		} finally {
			deletingId = null;
		}
	}

	async function openRating(job: JobListing): Promise<void> {
		ratingJob = job;
		ratingStars = 0;
		ratingStale = false;
		ratingError = null;
		ratingLoading = true;
		try {
			const existing = await getMyJobRating(job.id);
			if (ratingJob?.id === job.id && existing) {
				ratingStars = existing.stars;
				ratingStale = existing.stale;
			}
		} catch (loadError) {
			if (ratingJob?.id === job.id) ratingError = readableError(loadError);
		} finally {
			if (ratingJob?.id === job.id) ratingLoading = false;
		}
	}

	function closeRating(): void {
		if (!ratingSubmitting) ratingJob = null;
	}

	async function submitRating(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!ratingJob || ratingStars < 1) return;
		ratingError = null;
		ratingSubmitting = true;
		try {
			const updated = await rateJobListing(ratingJob.id, {
				stars: ratingStars,
				stale: ratingStale
			});
			jobs = jobs.map((job) => (job.id === updated.id ? updated : job));
			myJobs = myJobs.map((job) => (job.id === updated.id ? updated : job));
			successMessage = `Your rating for ${updated.title} was saved.`;
			ratingJob = null;
		} catch (submitError) {
			ratingError = readableError(submitError);
		} finally {
			ratingSubmitting = false;
		}
	}

	async function markApplied(job: JobListing): Promise<void> {
		if (applicationsByJob[job.id] || applyingJobIds.includes(job.id)) return;
		applyingJobIds = [...applyingJobIds, job.id];
		try {
			const application = await recordJobApplication(job.id);
			applicationsByJob = { ...applicationsByJob, [job.id]: application };
		} catch (applicationError) {
			applicationsError = readableError(applicationError);
		} finally {
			applyingJobIds = applyingJobIds.filter((id) => id !== job.id);
		}
	}
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && (ratingJob ? closeRating() : !submitting && onClose())} />

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
			<button class:active={view === 'mine'} type="button" onclick={() => (view = 'mine')}>Your posts <span>{myJobs.length}</span></button>
			<button class:active={view === 'post'} type="button" onclick={startNewListing}>Post a listing</button>
		</nav>

		{#if view === 'browse'}
			<div class="listing-view">
				{#if successMessage}<p class="success" role="status">{successMessage}</p>{/if}
				{#if applicationsError}<p class="error" role="alert">{applicationsError} <button type="button" onclick={loadApplications}>Retry</button></p>{/if}
				{#if jobsLoading}
					<p class="empty-state">Reading the board…</p>
				{:else if jobsError}
					<div class="empty-state"><p>{jobsError}</p><button type="button" onclick={loadJobs}>Try again</button></div>
				{:else if jobs.length === 0}
					<div class="empty-state"><p>Nothing has been pinned here yet.</p><button type="button" onclick={startNewListing}>Post the first listing</button></div>
				{:else}
					<div class="listings">
						{#each jobs as job (job.id)}
							<article class:applied={Boolean(applicationsByJob[job.id])} class="listing-card">
								<div class="listing-copy">
									<div class="listing-eyebrow">
										<p>{job.company}</p>
										{#if applicationsByJob[job.id]}<span>Applied</span>{/if}
									</div>
									<h2>{job.title}</h2>
									<div class="metadata"><span>{job.location}</span>{#if job.remote}<span>Remote</span>{/if}</div>
									{#if job.rating_count > 0}<p class="rating-summary"><span aria-hidden="true">★</span> {job.average_rating?.toFixed(1)} from {job.rating_count} rating{job.rating_count === 1 ? '' : 's'} · {job.stale_votes} stale vote{job.stale_votes === 1 ? '' : 's'}</p>{/if}
									{#if job.description}<p class="description">{job.description}</p>{/if}
									{#if job.tags.length}<div class="tags">{#each job.tags as tag}<span>{tag}</span>{/each}</div>{/if}
								</div>
								<div class="card-actions">
									<button type="button" onclick={() => openRating(job)}>Rate listing</button>
									<a
										class:application-recorded={Boolean(applicationsByJob[job.id])}
										href={job.external_url}
										target="_blank"
										rel="noopener noreferrer"
										onclick={() => void markApplied(job)}
									>
										{applicationsByJob[job.id]
											? 'Applied'
											: applyingJobIds.includes(job.id)
												? 'Marking…'
												: 'Apply'}
										<span aria-hidden="true">↗</span>
									</a>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</div>
		{:else if view === 'mine'}
			<div class="listing-view">
				{#if successMessage}<p class="success" role="status">{successMessage}</p>{/if}
				{#if myJobsLoading}
					<p class="empty-state">Finding your posts…</p>
				{:else if myJobsError}
					<div class="empty-state"><p>{myJobsError}</p><button type="button" onclick={loadMyJobs}>Try again</button></div>
				{:else if myJobs.length === 0}
					<div class="empty-state"><p>You haven’t posted a listing yet.</p><button type="button" onclick={startNewListing}>Post a listing</button></div>
				{:else}
					<div class="listings">
						{#each myJobs as job (job.id)}
							<article class="listing-card">
								<div class="listing-copy">
									<p>{job.company}</p>
									<h2>{job.title}</h2>
									<div class="metadata"><span>{job.location}</span>{#if job.remote}<span>Remote</span>{/if}</div>
									{#if job.rating_count > 0}<p class="rating-summary"><span aria-hidden="true">★</span> {job.average_rating?.toFixed(1)} from {job.rating_count} rating{job.rating_count === 1 ? '' : 's'} · {job.stale_votes} stale vote{job.stale_votes === 1 ? '' : 's'}</p>{/if}
									{#if job.description}<p class="description">{job.description}</p>{/if}
								</div>
								<div class="listing-actions">
									<button type="button" onclick={() => openRating(job)} disabled={deletingId === job.id}>Rate listing</button>
									<button type="button" onclick={() => startEditing(job)} disabled={deletingId === job.id}>Edit</button>
									<button class="danger" type="button" onclick={() => removeJob(job)} disabled={deletingId === job.id}>{deletingId === job.id ? 'Deleting…' : 'Delete'}</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
		<form onsubmit={submit}>
			<p class="intro">{editingJobId ? 'Update your listing on the office board.' : 'Share a direct employer listing with everyone in the office.'}</p>

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
					<button class="secondary" type="button" onclick={() => editingJobId ? (view = 'mine') : onClose()} disabled={submitting}>Cancel</button>
					<button class="primary" type="submit" disabled={submitting}>{submitting ? (editingJobId ? 'Saving…' : 'Posting…') : (editingJobId ? 'Save changes' : 'Post listing')}</button>
				</div>
			</footer>
		</form>
		{/if}
	</div>

	{#if ratingJob}
		<div class="rating-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeRating()}>
			<form class="rating-dialog" onsubmit={submitRating} aria-labelledby="rating-title">
				<div class="rating-heading">
					<div><p>Rate listing</p><h2 id="rating-title">{ratingJob.title}</h2></div>
					<button type="button" onclick={closeRating} disabled={ratingSubmitting} aria-label="Close rating dialog">×</button>
				</div>
				{#if ratingLoading}
					<p class="rating-loading">Loading your rating…</p>
				{:else}
					<fieldset>
						<legend>Your rating</legend>
						<div class="star-picker" aria-label={`${ratingStars || 'No'} stars selected`}>
							{#each [1, 2, 3, 4, 5] as star}
								<button class:chosen={star <= ratingStars} type="button" onclick={() => (ratingStars = star)} aria-label={`${star} star${star === 1 ? '' : 's'}`} aria-pressed={ratingStars === star}>★</button>
							{/each}
						</div>
					</fieldset>
					<label class="stale-toggle"><input type="checkbox" bind:checked={ratingStale} /><span>This listing appears stale</span></label>
					{#if ratingError}<p class="error" role="alert">{ratingError}</p>{/if}
					<div class="rating-footer">
						<button class="secondary" type="button" onclick={closeRating} disabled={ratingSubmitting}>Cancel</button>
						<button class="primary" type="submit" disabled={ratingSubmitting || ratingStars < 1}>{ratingSubmitting ? 'Saving…' : 'Save rating'}</button>
					</div>
				{/if}
			</form>
		</div>
	{/if}
</div>

<style>
	.backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 1.25rem; background: rgba(1,4,3,.68); backdrop-filter: blur(9px); }
	.board { width: min(48rem, 100%); max-height: calc(100dvh - 2.5rem); overflow: auto; border: 1px solid rgba(216,207,130,.27); border-radius: 2px; background: rgba(13,14,9,.98); box-shadow: 0 32px 100px rgba(0,0,0,.72), 0 0 60px rgba(216,207,130,.05); color: #f1edcf; }
	.board-header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; min-height: 5.4rem; padding: 1rem 1.25rem 1rem 1.5rem; border-bottom: 1px solid rgba(216,207,130,.15); background: rgba(14,15,10,.98); }
	.board-header p { margin: 0 0 .4rem; color: #cfc36f; font: 600 .58rem/1 var(--font-mono); letter-spacing: .13em; text-transform: uppercase; }
	h1 { margin: 0; font-family: var(--font-display); font-size: 1.65rem; letter-spacing: -.035em; }
	.close { width: 2.6rem; aspect-ratio: 1; border: 1px solid rgba(255,255,255,.1); background: transparent; color: #8ca197; font-size: 1.35rem; cursor: pointer; }
	.board-tabs { position: sticky; top: 5.4rem; z-index: 1; display: flex; border-bottom: 1px solid rgba(216,207,130,.12); background: rgba(14,15,10,.98); }
	.board-tabs button { flex: 1; min-height: 3rem; border: 0; border-right: 1px solid rgba(255,255,255,.07); background: transparent; color: #73847a; font: 600 .63rem/1 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
	.board-tabs button.active { box-shadow: inset 0 -2px #b7ad69; color: #ded79d; }
	.board-tabs span { display: inline-grid; min-width: 1.3rem; min-height: 1.3rem; margin-left: .35rem; place-items: center; border-radius: 50%; background: rgba(255,255,255,.07); font-size: .56rem; }
	form { padding: clamp(1.25rem, 4vw, 2rem); }
	.listing-view { padding: clamp(1.25rem, 4vw, 2rem); }
	.listings { display: grid; gap: .75rem; }
	.listing-card { display: flex; align-items: center; gap: 1rem; padding: 1.1rem; border: 1px solid rgba(211,203,137,.15); background: #121610; }
	.listing-card.applied { border-color: rgba(126,190,145,.32); background: linear-gradient(90deg, rgba(55,105,70,.12), #121610 35%); }
	.listing-copy { min-width: 0; flex: 1; }
	.listing-eyebrow { display: flex; align-items: center; gap: .55rem; margin-bottom: .35rem; }
	.listing-eyebrow p { margin: 0; color: #8e8a61; font: 600 .58rem/1 var(--font-mono); letter-spacing: .1em; text-transform: uppercase; }
	.listing-eyebrow span { padding: .2rem .38rem; border: 1px solid rgba(126,190,145,.3); background: rgba(55,105,70,.18); color: #9fd1ac; font: 650 .5rem/1 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }
	.listing-card h2 { margin: 0; color: #e5e1bd; font-size: 1rem; line-height: 1.3; }
	.metadata, .tags { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .65rem; }
	.metadata span, .tags span { padding: .25rem .4rem; background: rgba(198,191,126,.08); color: #929071; font: 500 .55rem/1 var(--font-mono); text-transform: uppercase; }
	.rating-summary { margin: .65rem 0 0; color: #cfc77f; font: 600 .65rem/1.4 var(--font-mono); }
	.rating-summary span { color: #f0cf62; }
	.description { display: -webkit-box; overflow: hidden; margin: .7rem 0 0; color: #8f9a8f; font-size: .75rem; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
	.card-actions { display: grid; flex: 0 0 auto; gap: .45rem; }
	.card-actions button, .card-actions a { min-width: 7rem; padding: .7rem .8rem; border: 1px solid rgba(211,203,137,.28); background: transparent; color: #d9d199; font: 600 .62rem/1 var(--font-mono); text-align: center; text-decoration: none; text-transform: uppercase; cursor: pointer; }
	.card-actions button:hover, .card-actions a:hover { border-color: #d9d199; background: rgba(211,203,137,.07); }
	.card-actions a.application-recorded { border-color: rgba(126,190,145,.32); color: #9fd1ac; }
	.listing-actions { display: flex; flex: 0 0 auto; gap: .5rem; }
	.listing-actions button { min-height: 2.35rem; padding: 0 .75rem; border: 1px solid rgba(211,203,137,.28); background: transparent; color: #d9d199; font: 600 .62rem/1 var(--font-mono); text-transform: uppercase; cursor: pointer; }
	.listing-actions button:hover { border-color: #d9d199; background: rgba(211,203,137,.07); }
	.listing-actions button.danger { border-color: rgba(255,116,116,.3); color: #ffabab; }
	.listing-actions button.danger:hover { border-color: #ff9a9a; background: rgba(117,31,31,.14); }
	.rating-backdrop { position: fixed; inset: 0; z-index: 5; display: grid; place-items: center; padding: 1rem; background: rgba(1,4,3,.78); backdrop-filter: blur(5px); }
	.rating-dialog { width: min(28rem, 100%); padding: 1.4rem; border: 1px solid rgba(216,207,130,.28); background: #0e0f0a; box-shadow: 0 24px 80px rgba(0,0,0,.8); }
	.rating-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
	.rating-heading p { margin: 0 0 .4rem; color: #cfc36f; font: 600 .58rem/1 var(--font-mono); letter-spacing: .13em; text-transform: uppercase; }
	.rating-heading h2 { margin: 0; color: #eef8f2; font-size: 1.15rem; }
	.rating-heading button { border: 0; background: transparent; color: #8ca197; font-size: 1.4rem; cursor: pointer; }
	.rating-dialog fieldset { margin: 1.5rem 0 1rem; padding: 0; border: 0; }
	.rating-dialog legend { margin-bottom: .7rem; color: #b7c8bf; font: 600 .64rem/1 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; }
	.star-picker { display: flex; gap: .25rem; }
	.star-picker button { padding: .15rem; border: 0; background: transparent; color: #49534e; font-size: 2rem; line-height: 1; cursor: pointer; }
	.star-picker button.chosen { color: #f0cf62; text-shadow: 0 0 12px rgba(240,207,98,.2); }
	.stale-toggle { display: flex; align-items: center; gap: .65rem; padding: .85rem; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.025); }
	.stale-toggle input { width: 1rem; min-height: auto; accent-color: #ff9a9a; }
	.rating-loading { min-height: 9rem; display: grid; place-items: center; color: #829187; }
	.rating-footer { display: flex; justify-content: flex-end; gap: .65rem; margin-top: 1.25rem; }
	.rating-footer button { min-height: 2.7rem; padding: 0 1rem; border-radius: 2px; font: 650 .76rem/1 var(--font-display); cursor: pointer; }
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
	input:focus, textarea:focus { border-color: rgba(216,207,130,.65); box-shadow: 0 0 0 2px rgba(216,207,130,.08); }
	.remote-toggle { display: flex; align-items: center; gap: .6rem; min-height: 2.9rem; padding-top: 1.45rem; }
	.remote-toggle input { width: 1rem; min-height: auto; accent-color: #cfc36f; }
	.error, .success { padding: .85rem 1rem; border: 1px solid rgba(255,255,255,.09); font-size: .78rem; line-height: 1.5; }
	.error { border-color: rgba(255,116,116,.24); background: rgba(117,31,31,.14); color: #ffb0b0; }
	.success { border-color: rgba(216,207,130,.26); background: rgba(119,105,38,.12); color: #e2d88e; }
	footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(255,255,255,.08); }
	footer p { margin: 0; color: #64746b; font: 500 .6rem/1.4 var(--font-mono); text-transform: uppercase; }
	footer div { display: flex; gap: .65rem; }
	footer button { min-height: 2.8rem; padding: 0 1.15rem; border-radius: 2px; font: 650 .78rem/1 var(--font-display); cursor: pointer; }
	.primary { border: 1px solid #c7b957; background: #c7b957; color: #17160c; }
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
		.card-actions { grid-template-columns: 1fr 1fr; }
		.card-actions button, .card-actions a { min-width: 0; }
		.listing-actions button { flex: 1; }
	}
</style>
