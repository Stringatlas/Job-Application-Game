import type { User } from '@auth0/auth0-spa-js';

export type AuthStatus = 'loading' | 'guest' | 'authenticated' | 'error';

export interface AuthState {
	status: AuthStatus;
	user: User | null;
	error: string | null;
}

export interface LoginReturnState {
	returnTo: string;
	spawn: 'login-kiosk';
}
