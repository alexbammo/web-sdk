<script lang="ts">
	/**
	 * App shell.
	 *
	 * Authenticate is what turns this from a local demo into an RGS client: it
	 * reads rgs_url / sessionID / lang / device from the query string (never
	 * hardcoded), authenticates on load, and populates stateBet with the balance,
	 * currency and the bet levels the operator allows. The reviewer checklist
	 * opens with "game authenticates with RGS successfully on game launch" —
	 * without this, submission fails before the game itself is judged.
	 *
	 * Order matters: context must be set before Authenticate mounts, and
	 * LoadI18n must wrap Game so nothing renders untranslated.
	 */
	import { type Snippet } from 'svelte';
	import { GlobalStyle } from 'components-ui-html';
	import { Authenticate, LoadI18n } from 'components-shared';

	import Game from '../components/Game.svelte';
	import { setContext } from '../game/context';
	import messagesMap from '../i18n/messagesMap';

	type Props = { children: Snippet };
	const props: Props = $props();

	setContext();
</script>

<GlobalStyle>
	<Authenticate>
		<LoadI18n {messagesMap}>
			<Game />
		</LoadI18n>
	</Authenticate>
</GlobalStyle>

{@render props.children()}
