// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';

const REPO_URL = 'https://github.com/Shaya16/Spent';

export default defineConfig({
	site: 'https://shaya16.github.io',
	base: '/Spent',
	trailingSlash: 'ignore',
	integrations: [
		starlight({
			title: 'Spent',
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				replacesTitle: true,
			},
			favicon: '/favicon.svg',
			customCss: ['./src/styles/global.css'],
			head: [
				{
					tag: 'meta',
					attrs: { name: 'description', content: 'A local-only personal finance tracker for Israeli banks. Beautiful, private, open source.' },
				},
				{
					tag: 'script',
					content: "document.documentElement.dataset.theme='light';try{localStorage.setItem('starlight-theme','light')}catch{}",
				},
			],
			components: {
				ThemeSelect: './src/components/starlight-overrides/ThemeSelect.astro',
			},
			expressiveCode: {
				themes: ['github-light'],
				styleOverrides: {
					borderRadius: '0.5rem',
					borderColor: '#ECE3D2',
					codeBackground: '#FCF7ED',
					frames: {
						editorTabBarBackground: '#F5EBD8',
						terminalTitlebarBackground: '#F5EBD8',
						terminalBackground: '#FCF7ED',
					},
				},
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: REPO_URL },
			],
			sidebar: [
				{
					label: 'Welcome',
					items: [
						{ label: 'Getting started', slug: 'getting-started' },
					],
				},
				{
					label: 'Install',
					items: [
						{ label: 'On macOS', slug: 'install/mac' },
						{ label: 'On Windows', slug: 'install/windows' },
					],
				},
				{
					label: 'Using Spent',
					items: [
						{ label: 'Connect your bank', slug: 'connect-bank' },
						{ label: 'Categorize with AI', slug: 'ai-categorization' },
						{ label: 'Sync & dashboard', slug: 'sync-and-dashboard' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Troubleshooting', slug: 'troubleshooting' },
						{ label: 'Security & privacy', slug: 'security-and-privacy' },
						{ label: 'Disclaimer', slug: 'disclaimer' },
					],
				},
			],
			pagination: true,
			lastUpdated: true,
		}),
		mdx(),
	],
});
