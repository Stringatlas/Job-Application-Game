import { env } from '$env/dynamic/public';
import { auth } from '$lib/auth/auth-store';
import type { JobListing, JobListingCreate, UserProfile } from './types';

const API_BASE_URL = (env.PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly retryAfterSeconds: number | null = null
	) {
		super(message);
	}
}

function errorMessage(body: unknown): string {
	if (typeof body !== 'object' || body === null || !('detail' in body)) return 'Request failed';
	const detail = body.detail;
	if (typeof detail === 'string') return detail;
	if (Array.isArray(detail)) {
		return detail
			.map((issue) =>
				typeof issue === 'object' && issue !== null && 'msg' in issue ? String(issue.msg) : null
			)
			.filter(Boolean)
			.join('. ');
	}
	return 'Request failed';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const accessToken = await auth.getAccessToken();
	const response = await fetch(`${API_BASE_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...init.headers
		}
	});

	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
		throw new ApiError(
			errorMessage(body),
			response.status,
			Number.isFinite(retryAfter) ? retryAfter : null
		);
	}
	return (await response.json()) as T;
}

export async function getMyProfile(): Promise<UserProfile | null> {
	try {
		return await request<UserProfile>('/api/users/me/profile');
	} catch (error) {
		if (error instanceof ApiError && error.status === 404) return null;
		throw error;
	}
}

export function saveMyProfile(username: string, displayName: string | null): Promise<UserProfile> {
	return request<UserProfile>('/api/users/me/profile', {
		method: 'PUT',
		body: JSON.stringify({ username, display_name: displayName })
	});
}

export function createJobListing(job: JobListingCreate): Promise<JobListing> {
	return request<JobListing>('/api/jobs', {
		method: 'POST',
		body: JSON.stringify(job)
	});
}

export function listJobListings(): Promise<JobListing[]> {
	return request<JobListing[]>('/api/jobs');
}
