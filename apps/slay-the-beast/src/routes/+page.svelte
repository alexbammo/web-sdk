<script lang="ts">
	import { buildMockBook } from '../game/mockBook';

	const winBook = buildMockBook('win', 1);
	const lossBook = buildMockBook('loss', 2);
</script>

<main>
	<h1>Slay the Beast — Phase B</h1>
	<p>
		Book-event contract locked. Below are two mock books matching <code>typesBookEvent.ts</code>.
		Phase C will wire these into PixiJS rendering handlers.
	</p>

	<section>
		<h2>Win scenario (id {winBook.id}) — payoutMultiplier {winBook.payoutMultiplier}</h2>
		<pre>{JSON.stringify(winBook, null, 2)}</pre>
	</section>

	<section>
		<h2>Loss scenario (id {lossBook.id}) — payoutMultiplier {lossBook.payoutMultiplier}</h2>
		<pre>{JSON.stringify(lossBook, null, 2)}</pre>
	</section>
</main>

<style>
	main {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		max-width: 900px;
		margin: 2rem auto;
		padding: 0 1rem;
		color: #eee;
		background: #111;
		min-height: 100vh;
	}
	h1 {
		color: #ffcc44;
	}
	h2 {
		color: #88ddff;
		font-size: 1rem;
		margin-top: 2rem;
	}
	pre {
		background: #1a1a1a;
		border: 1px solid #333;
		padding: 1rem;
		overflow-x: auto;
		font-size: 0.8rem;
		line-height: 1.4;
	}
	code {
		background: #222;
		padding: 0.1em 0.3em;
		border-radius: 3px;
	}
</style>
