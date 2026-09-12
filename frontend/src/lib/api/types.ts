export interface UserProfile {
	id: string;
	username: string;
	display_name: string | null;
	created_at: string;
	updated_at: string;
}

export interface JobListingCreate {
	title: string;
	company: string;
	location: string;
	remote: boolean;
	external_url: string;
	description: string | null;
	tags: string[];
}

export interface JobListing extends JobListingCreate {
	id: string;
	submitter_id: string;
	status: 'active' | 'possibly_stale' | 'hidden';
	useful_votes: number;
	stale_votes: number;
	average_rating: number | null;
	rating_count: number;
	created_at: string;
	updated_at: string;
}

export interface JobRating {
	stars: number;
	stale: boolean;
}

export type JobApplicationStatus =
	| 'applied'
	| 'interviewing'
	| 'offer'
	| 'rejected'
	| 'withdrawn';

export interface JobApplication {
	id: string;
	user_id: string;
	job_listing_id: string;
	status: JobApplicationStatus;
	applied_at: string;
	updated_at: string;
}

export interface WebSocketTicket {
	ticket: string;
	expires_in: number;
}
