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
	created_at: string;
	updated_at: string;
}
