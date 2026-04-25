<script lang="ts">
	import { buildMockBook } from '../game/mockBook';

	const winBigChaos = buildMockBook('win-big-chaos', 1);
	const winStandardAnte = buildMockBook('win-standard-ante', 2);
	const lossBananaBase = buildMockBook('loss-banana-base', 3);
	const lossCombustBase = buildMockBook('loss-combust-base', 4);
	const winLightningMode = buildMockBook('win-lightning-mode-base', 5);
	const winMiniPassed = buildMockBook('win-mini-passed-base', 6);
	const lossFinalPassed = buildMockBook('loss-final-passed-base', 7);
</script>

<main>
	<h1>Slay the Beast — Phase 0 (prototype-aligned contract)</h1>
	<p>
		Book-event contract rewritten to match the prototype vocab (fodder / big-kill / flying dragon
		/ chest / potion / powerdown / mini-boss / final-boss / lightning / ambush). Three bet modes
		wired: <strong>base</strong> (1×), <strong>ante</strong> (5×, no instant death),
		<strong>chaos</strong> (100×, power glow + guaranteed final boss). These mocks will be
		replaced by Python math-sdk output in Phase 1.
	</p>

	<section>
		<h2>
			Win (big, CHAOS mode) — id {winBigChaos.id} — payout {winBigChaos.payoutMultiplier}× ({
				winBigChaos.events.length
			} events)
		</h2>
		<pre>{JSON.stringify(winBigChaos, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Win (standard, ANTE mode) — id {winStandardAnte.id} — payout {winStandardAnte.payoutMultiplier}× ({
				winStandardAnte.events.length
			} events)
		</h2>
		<pre>{JSON.stringify(winStandardAnte, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Loss (banana ambush, BASE mode) — id {lossBananaBase.id} — payout {lossBananaBase.payoutMultiplier}× ({
				lossBananaBase.events.length
			} events)
		</h2>
		<pre>{JSON.stringify(lossBananaBase, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Loss (spontaneous combustion, BASE mode) — id {lossCombustBase.id} — payout {lossCombustBase.payoutMultiplier}× ({
				lossCombustBase.events.length
			} events)
		</h2>
		<pre>{JSON.stringify(lossCombustBase, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Win (LIGHTNING MODE buff, BASE mode) — id {winLightningMode.id} — payout {winLightningMode.payoutMultiplier}× ({
				winLightningMode.events.length
			} events)
		</h2>
		<pre>{JSON.stringify(winLightningMode, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Win (mini-boss PASSED, BASE mode) — id {winMiniPassed.id} — payout {winMiniPassed.payoutMultiplier}× ({
				winMiniPassed.events.length
			} events)
		</h2>
		<pre>{JSON.stringify(winMiniPassed, null, 2)}</pre>
	</section>

	<section>
		<h2>
			Loss (final-boss PASSED, BASE mode) — id {lossFinalPassed.id} — payout {lossFinalPassed.payoutMultiplier}× ({
				lossFinalPassed.events.length
			} events)
		</h2>
		<pre>{JSON.stringify(lossFinalPassed, null, 2)}</pre>
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
