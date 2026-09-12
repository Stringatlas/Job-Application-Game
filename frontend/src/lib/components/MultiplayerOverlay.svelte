<script lang="ts">
	import { tick } from 'svelte';
	import type { ChatEntry, ConnectionStatus, PlayerState } from '$lib/game/multiplayer/types';

	interface Props {
		players: PlayerState[];
		messages: ChatEntry[];
		status: ConnectionStatus;
		onSendChat: (text: string) => boolean;
		onChatFocusChange: (focused: boolean) => void;
	}

	let { players, messages, status, onSendChat, onChatFocusChange }: Props = $props();
	let chatText = $state('');
	let messageList: HTMLDivElement;

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (onSendChat(chatText)) chatText = '';
	}

	$effect(() => {
		messages.length;
		void tick().then(() => messageList?.scrollTo({ top: messageList.scrollHeight }));
	});
</script>

<details class="presence">
	<summary aria-label={`${players.length} active players`}>
		<span class:online={status === 'connected'} class="status-dot"></span>
		<span>{status === 'connected' ? players.length : '—'} active</span>
	</summary>
	<div class="player-panel">
		<p>In the office</p>
		{#if players.length}
			<ul>
				{#each players as player (player.id)}
					<li><span></span>{player.username}</li>
				{/each}
			</ul>
		{:else}
			<div class="empty">{status === 'connected' ? 'The office is empty.' : 'Connecting…'}</div>
		{/if}
	</div>
</details>

<section class="chat" aria-label="Office chat">
	<header>
		<span>Office chat</span>
		<small>{status}</small>
	</header>
	<div class="messages" bind:this={messageList} aria-live="polite">
		{#if messages.length === 0}
			<p class="hint">Player arrivals and messages appear here.</p>
		{/if}
		{#each messages as message (message.id)}
			<p class:system={message.kind === 'system'}>
				{#if message.username}<strong>{message.username}</strong>{/if}
				{message.text}
			</p>
		{/each}
	</div>
	<form onsubmit={submit}>
		<label for="office-chat">Message the office</label>
		<input
			id="office-chat"
			bind:value={chatText}
			maxlength="300"
			placeholder={status === 'connected' ? 'Press enter to chat…' : 'Waiting for connection…'}
			disabled={status !== 'connected'}
			onfocus={() => onChatFocusChange(true)}
			onblur={() => onChatFocusChange(false)}
		/>
	</form>
</section>

<style>
	.presence {
		position: absolute; top: 1rem; right: 1rem; z-index: 4; display: flex; align-items: center; gap: 0.5rem;
		padding: 0.62rem 0.78rem; border: 1px solid rgba(216, 207, 130, 0.38); border-radius: 4px;
		background: rgba(11, 12, 8, 0.88); color: #f4efc2; backdrop-filter: blur(10px);
		font: 500 0.72rem/1 var(--font-mono); letter-spacing: 0.04em;
	}
	.presence summary { display: flex; align-items: center; gap: 0.5rem; cursor: default; list-style: none; outline: none; }
	.presence summary::-webkit-details-marker { display: none; }
	.presence summary:focus-visible { outline: 2px solid #d8cf82; outline-offset: 5px; }
	.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #777568; box-shadow: 0 0 0 3px rgba(119, 117, 104, 0.12); }
	.status-dot.online { background: #cfc36f; box-shadow: 0 0 0 3px rgba(207, 195, 111, 0.14); }
	.player-panel {
		position: absolute; top: calc(100% + 0.45rem); right: 0; width: 210px; padding: 0.75rem;
		border: 1px solid rgba(216, 207, 130, 0.35); border-radius: 4px; background: rgba(9, 10, 7, 0.96);
		box-shadow: 0 14px 38px rgba(0, 0, 0, 0.48); opacity: 0; visibility: hidden; translate: 0 -4px;
		transition: 120ms ease; transition-property: opacity, translate, visibility;
	}
	.presence:hover .player-panel, .presence:focus-within .player-panel, .presence[open] .player-panel { opacity: 1; visibility: visible; translate: 0; }
	.player-panel p { margin: 0 0 0.55rem; color: #8d8c77; font-size: 0.61rem; text-transform: uppercase; }
	.player-panel ul { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
	.player-panel li { overflow: hidden; display: flex; gap: 0.5rem; align-items: center; color: #f7f3d2; text-overflow: ellipsis; white-space: nowrap; }
	.player-panel li span { flex: 0 0 auto; width: 6px; height: 6px; border-radius: 50%; background: #cfc36f; }
	.empty { color: #8d8c77; }
	.chat {
		position: absolute; left: 1rem; bottom: 1rem; z-index: 4; width: min(350px, calc(100vw - 2rem)); overflow: hidden;
		border: 1px solid rgba(216, 207, 130, 0.32); border-radius: 4px; background: rgba(9, 10, 7, 0.84);
		box-shadow: 0 14px 38px rgba(0, 0, 0, 0.45); backdrop-filter: blur(10px); color: #e9e5c2;
	}
	.chat header { display: flex; justify-content: space-between; padding: 0.62rem 0.75rem; border-bottom: 1px solid rgba(216, 207, 130, 0.16); font: 600 0.68rem/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; }
	.chat header small { color: #858473; font: inherit; font-size: 0.58rem; }
	.messages { height: 116px; overflow-y: auto; padding: 0.55rem 0.75rem; scrollbar-width: thin; }
	.messages p { margin: 0 0 0.38rem; overflow-wrap: anywhere; font-size: 0.74rem; line-height: 1.35; }
	.messages strong { margin-right: 0.4rem; color: #fff8bd; font-family: var(--font-mono); font-size: 0.68rem; }
	.messages p.system, .messages p.hint { color: #858473; font-style: italic; }
	.chat form { border-top: 1px solid rgba(216, 207, 130, 0.16); }
	.chat label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
	.chat input { width: 100%; border: 0; padding: 0.68rem 0.75rem; outline: 0; background: rgba(0, 0, 0, 0.24); color: #fffde8; font: 0.72rem var(--font-mono); }
	.chat input::placeholder { color: #656559; }
	.chat input:focus { box-shadow: inset 0 0 0 1px rgba(207, 195, 111, 0.45); }
	.chat input:disabled { cursor: not-allowed; }
	@media (max-width: 520px) { .messages { height: 90px; } }
</style>
