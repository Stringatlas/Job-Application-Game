import { writable } from 'svelte/store';
import { authService } from './auth-service';
import type { AuthState } from './types';

const initialState: AuthState = {
	status: 'loading',
	user: null,
	error: null
};

function readableError(error: unknown): string {
	return error instanceof Error ? error.message : 'Authentication failed';
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	return {
		subscribe,
		async initialize() {
			try {
				const user = await authService.initialize();
				set({ status: user ? 'authenticated' : 'guest', user, error: null });
			} catch (error) {
				set({ status: 'error', user: null, error: readableError(error) });
			}
		},
		async login() {
			update((state) => ({ ...state, error: null }));
			await authService.login();
		},
		async loginWithGoogle() {
			update((state) => ({ ...state, error: null }));
			await authService.loginWithGoogle();
		},
		async signUp() {
			update((state) => ({ ...state, error: null }));
			await authService.signUp();
		},
		async logout() {
			await authService.logout();
		},
		getAccessToken: () => authService.getAccessToken()
	};
}

export const auth = createAuthStore();
