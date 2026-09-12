<script lang="ts">
	import favicon from '$lib/assets/favicon.jpeg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#050607" />
</svelte:head>

{@render children()}
