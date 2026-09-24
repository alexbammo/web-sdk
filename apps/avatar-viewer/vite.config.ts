import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const apiPort = Number(process.env.API_PORT ?? 3011);

export default defineConfig({
	plugins: [svelte()],
	server: {
		proxy: {
			'/api': `http://localhost:${apiPort}`,
		},
	},
	build: {
		target: 'es2022',
		chunkSizeWarningLimit: 2000,
	},
});
