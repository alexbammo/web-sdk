<script lang="ts">
	// Game and setContext moved to +layout.svelte, which now wraps them in
	// GlobalStyle > Authenticate > LoadI18n. Mounting Game here as well would
	// instantiate the scene twice, and setContext here would run before the
	// layout's — leaving Authenticate reading a context it did not set.
</script>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #07080a;
		overflow: hidden;
	}
</style>
