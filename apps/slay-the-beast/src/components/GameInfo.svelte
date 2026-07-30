<script lang="ts">
	/**
	 * Rules / paytable / modes / legal.
	 *
	 * Approval requires all four to be reachable in-game, and explicitly states
	 * that a submission without a disclaimer is not approved. The SDK ships
	 * ModalGameRules and ModalPayTable, but both render literal placeholder text
	 * ("ADD YOUR GAME RULES"), so the content has to be authored regardless —
	 * this renders it directly rather than forking two SDK modals to say the
	 * same thing in two places.
	 *
	 * Visual treatment is deliberately plain. The design system is specified
	 * separately; the requirement being satisfied here is that the information
	 * exists, is accurate and is reachable.
	 */
	import {
		RULES_SECTIONS,
		PAYTABLE_ROWS,
		DISCLAIMER,
		modeRows,
	} from '../game/gameRulesContent';

	type Props = { onclose: () => void };
	const props: Props = $props();

	const TABS = ['RULES', 'PAYTABLE', 'MODES', 'LEGAL'] as const;
	let tab = $state<(typeof TABS)[number]>('RULES');

	const rows = modeRows();
</script>

<div
	class="scrim"
	role="dialog"
	aria-modal="true"
	aria-labelledby="info-title"
	onkeydown={(e) => e.key === 'Escape' && props.onclose()}
>
	<div class="panel">
		<header>
			<h2 id="info-title">HOW TO PLAY</h2>
			<button class="close" onclick={props.onclose} aria-label="Close">×</button>
		</header>

		<nav>
			{#each TABS as t (t)}
				<button class:active={tab === t} onclick={() => (tab = t)}>{t}</button>
			{/each}
		</nav>

		<div class="body">
			{#if tab === 'RULES'}
				{#each RULES_SECTIONS as section (section.heading)}
					<h3>{section.heading}</h3>
					{#each section.body as para (para)}<p>{para}</p>{/each}
				{/each}
			{:else if tab === 'PAYTABLE'}
				<table>
					<tbody>
						{#each PAYTABLE_ROWS as row (row.name)}
							<tr><th scope="row">{row.name}</th><td>{row.effect}</td></tr>
						{/each}
					</tbody>
				</table>
				<p class="example">
					Worked example: a run ending on 4,600 GOLD pays 4.60× your bet. At a 1.00 bet that
					is a win of 4.60; at a 5.00 bet, 23.00. The GOLD is the same either way.
				</p>
			{:else if tab === 'MODES'}
				{#each rows as r (r.mode)}
					<h3>{r.mode.toUpperCase()}</h3>
					<p>{r.description}</p>
					<dl>
						<dt>Cost</dt><dd>{r.cost}</dd>
						<dt>Return to player</dt><dd>{r.rtp}</dd>
						<dt>Max win</dt><dd>{r.maxWin}</dd>
						<dt>Win frequency</dt><dd>{r.hitRate}</dd>
					</dl>
				{/each}
			{:else}
				{#each DISCLAIMER as d (d.point)}
					<p class="legal">{d.text}</p>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(7, 8, 10, 0.86);
		display: grid;
		place-items: center;
		z-index: 150;
		font-family: ui-sans-serif, system-ui, sans-serif;
		color: #fef5d2;
	}
	.panel {
		width: min(560px, 92vw);
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		background: #313000;
		border: 2px solid #8b761c;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border-bottom: 1px solid #726217;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
		letter-spacing: 0.12em;
		color: #e8cb52;
	}
	.close {
		background: none;
		border: none;
		color: #c9be8e;
		font-size: 1.4rem;
		cursor: pointer;
		line-height: 1;
	}
	nav {
		display: flex;
		border-bottom: 1px solid #726217;
	}
	nav button {
		flex: 1;
		padding: 10px 4px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: #8a8163;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		cursor: pointer;
	}
	nav button.active {
		color: #e8cb52;
		border-bottom-color: #e8cb52;
	}
	.body {
		overflow-y: auto;
		padding: 16px 18px 22px;
		font-size: 0.82rem;
		line-height: 1.55;
	}
	h3 {
		margin: 16px 0 6px;
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		color: #e8cb52;
	}
	h3:first-child {
		margin-top: 0;
	}
	p {
		margin: 0 0 8px;
		color: #d8d0ac;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		text-align: left;
		width: 38%;
		padding: 6px 10px 6px 0;
		font-weight: 700;
		color: #fef5d2;
		vertical-align: top;
	}
	td {
		padding: 6px 0;
		color: #d8d0ac;
	}
	tr + tr th,
	tr + tr td {
		border-top: 1px solid #454413;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 14px;
		margin: 0 0 14px;
	}
	dt {
		color: #8a8163;
	}
	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.example {
		margin-top: 12px;
		color: #8a8163;
		font-size: 0.75rem;
	}
	.legal {
		font-size: 0.75rem;
		line-height: 1.6;
		color: #b3ab8b;
	}
</style>
