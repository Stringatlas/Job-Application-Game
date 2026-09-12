import {
	createAuth0Client,
	type Auth0Client,
	type RedirectLoginOptions,
	type User
} from '@auth0/auth0-spa-js';
import {
	PUBLIC_AUTH0_AUDIENCE,
	PUBLIC_AUTH0_CLIENT_ID,
	PUBLIC_AUTH0_DOMAIN,
	PUBLIC_AUTH0_REDIRECT_URI
} from '$env/static/public';
import type { LoginReturnState } from './types';

const LOGIN_RETURN_STATE: LoginReturnState = {
	returnTo: '/',
	spawn: 'login-kiosk'
};
const PENDING_USERNAME_KEY = 'jag:pending-username';

export class AuthService {
	private client: Auth0Client | null = null;

	async initialize(): Promise<User | null> {
		this.assertConfigured();
		this.client = await createAuth0Client({
			domain: PUBLIC_AUTH0_DOMAIN,
			clientId: PUBLIC_AUTH0_CLIENT_ID,
			authorizationParams: {
				audience: PUBLIC_AUTH0_AUDIENCE,
				redirect_uri: PUBLIC_AUTH0_REDIRECT_URI,
				scope: 'openid profile email'
			}
		});

		const query = new URLSearchParams(window.location.search);
		if ((query.has('code') || query.has('error')) && query.has('state')) {
			const result = await this.client.handleRedirectCallback<LoginReturnState>();
			if (result.appState?.spawn) sessionStorage.setItem('jag:spawn', result.appState.spawn);
			window.history.replaceState({}, document.title, window.location.pathname);
		}

		return (await this.client.getUser()) ?? null;
	}

	async login(options?: RedirectLoginOptions<LoginReturnState>): Promise<void> {
		await this.requireClient().loginWithRedirect({
			appState: LOGIN_RETURN_STATE,
			...options
		});
	}

	async loginWithGoogle(): Promise<void> {
		await this.login({ authorizationParams: { connection: 'google-oauth2' } });
	}

	async signUp(username: string): Promise<void> {
		sessionStorage.setItem(PENDING_USERNAME_KEY, username);
		await this.login({ authorizationParams: { screen_hint: 'signup' } });
	}

	getPendingUsername(): string | null {
		return sessionStorage.getItem(PENDING_USERNAME_KEY);
	}

	clearPendingUsername(): void {
		sessionStorage.removeItem(PENDING_USERNAME_KEY);
	}

	async logout(): Promise<void> {
		await this.requireClient().logout({
			logoutParams: { returnTo: PUBLIC_AUTH0_REDIRECT_URI }
		});
	}

	async getAccessToken(): Promise<string> {
		return this.requireClient().getTokenSilently();
	}

	private requireClient(): Auth0Client {
		if (!this.client) throw new Error('Auth0 has not finished initializing');
		return this.client;
	}

	private assertConfigured(): void {
		if (
			!PUBLIC_AUTH0_DOMAIN ||
			!PUBLIC_AUTH0_CLIENT_ID ||
			!PUBLIC_AUTH0_AUDIENCE ||
			!PUBLIC_AUTH0_REDIRECT_URI
		) {
			throw new Error('Auth0 environment variables are incomplete');
		}
	}
}

export const authService = new AuthService();
