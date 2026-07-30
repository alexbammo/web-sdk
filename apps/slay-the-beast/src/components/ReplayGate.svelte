<script lang="ts">
	/**
	 * Replay gate.
	 *
	 * Replay support is mandatory — a game without it is not approved. It is also
	 * the vehicle through which the game is REVIEWED: submission requires event
	 * IDs demonstrating a normal win, a large payout, a max win, a loss and a
	 * bonus trigger, for every bet mode. So a reviewer watches this screen
	 * fifteen times, and watches the max-win presentation three of those. It is
	 * worth more polish than its size suggests.
	 *
	 * Authenticate already does the detection and the fetch: it sees
	 * `replay=true`, sets `stateUi.config.mode = 'replay'` and pulls the bet from
	 * the RGS replay endpoint into `stateBet.betToResume`. What this adds is the
	 * gate itself — the requirement is a Start Replay button labelled with the
	 * mode, the base bet, the cost multiplier and the currency, shown before
	 * playback begins.
	 */
	import { stateBet, stateUrlDerived } from 'state-shared';

	import { getContext } from '../game/context';
	import { MODE_COST, MODE_LABEL, type BetMode } from '../game/types';

	const context = getContext();

	let started = $state(false);

	const mode = $derived((stateUrlDerived.mode() || 'base').toLowerCase() as BetMode);
	const costMultiplier = $derived(MODE_COST[mode] ?? 1);
	const betAmount = $derived(stateBet.betAmount || 0);
	const totalCost = $derived(betAmount * costMultiplier);
	const currency = $derived(stateBet.currency || 'USD');

	const fmt = (n: number) => n.toFixed(2);

	const start = () => {
		started = true;
		// Replays run through the same resume path as an interrupted round, so the
		// scene renders identically to the original — which is the point.
		context.eventEmitter.broadcast({ type: 'resumeBet' });
	};
</script>

{#if !started}
	<div class="replay-gate" role="dialog" aria-modal="true" aria-labelledby="replay-title">
		<div class="panel">
			<h1 id="replay-title">REPLAY</h1>

			<dl>
				<dt>MODE</dt>
				<dd>{MODE_LABEL[mode] ?? mode.toUpperCase()}</dd>
				<dt>BET</dt>
				<dd>{fmt(betAmount)} {currency}</dd>
				<dt>COST</dt>
				<dd>{fmt(totalCost)} {currency} ({costMultiplier}×)</dd>
			</dl>

			<button class="start" onclick={start}>
				▶ START REPLAY — {MODE_LABEL[mode] ?? mode.toUpperCase()} · {fmt(totalCost)}
				{currency}
			</button>

			<p class="note">
				This is a replay of a completed round. No bet will be placed and no balance will change.
			</p>
		</div>
	</div>
{/if}

<style>
	.replay-gate {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(7, 8, 10, 0.92);
		z-index: 200;
		font-family: ui-sans-serif, system-ui, sans-serif;
		color: #fef5d2;
	}
	.panel {
		max-width: 360px;
		padding: 28px 32px;
		border: 2px solid #8b761c;
		background: #313000;
		text-align: center;
	}
	h1 {
		margin: 0 0 20px;
		font-size: 1.4rem;
		letter-spacing: 0.14em;
		color: #e8cb52;
	}
	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: 6px 20px;
		justify-content: center;
		margin: 0 0 22px;
		font-size: 0.85rem;
	}
	dt {
		color: #c9be8e;
		letter-spacing: 0.08em;
		text-align: right;
	}
	dd {
		margin: 0;
		font-weight: 700;
		text-align: left;
		font-variant-numeric: tabular-nums;
	}
	.start {
		width: 100%;
		padding: 12px 16px;
		font-size: 0.85rem;
		font-weight: 800;
		background: #e8cb52;
		color: #1a1600;
		border: none;
		cursor: pointer;
	}
	.start:hover {
		background: #fae277;
	}
	.note {
		margin: 16px 0 0;
		font-size: 0.7rem;
		line-height: 1.5;
		color: #8a8163;
	}
</style>
