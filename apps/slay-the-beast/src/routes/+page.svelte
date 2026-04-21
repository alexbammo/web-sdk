<script lang="ts">
	import { buildMockBook } from '../game/mockBook';

	const winBig = buildMockBook('win-big', 1);
	const winStandard = buildMockBook('win-standard', 2);
	const lossAmbush = buildMockBook('loss-ambush', 3);
</script>

<main>
	<h1>Slay the Beast — Phase B.5</h1>
	<p>
		Book-event contract expanded to <strong>14 variants</strong> covering pickups, sky rides,
		slowers, terrain hazards, allies, and multiple death flavours. Three mock scenarios below
		exercise 13/14 variants (terrain-hazard-died covered in Phase C Storybook).
	</p>

	<section>
		<h2>
			Win (big) — id {winBig.id} — payout {winBig.payoutMultiplier} ({winBig.events.length}
			events)
		</h2>
		<pre>{JSON.stringify(winBig, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Win (standard) — id {winStandard.id} — payout {winStandard.payoutMultiplier} ({winStandard
				.events.length} events)
		</h2>
		<pre>{JSON.stringify(winStandard, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Loss (ambush) — id {lossAmbush.id} — payout {lossAmbush.payoutMultiplier} ({lossAmbush
				.events.length} events)
		</h2>
		<pre>{JSON.stringify(lossAmbush, null, 2)}</pre>
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
	strong {
		color: #ffcc44;
	}
</style>
