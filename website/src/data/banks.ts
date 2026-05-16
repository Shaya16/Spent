export type Bank = {
	id: string;
	name: string;
	kind: 'bank' | 'card' | 'other';
	color: string;
	blurb: string;
};

export const BANKS: Bank[] = [
	{ id: 'isracard', name: 'Isracard', kind: 'card', color: '#E50019', blurb: 'Israeli Mastercard / Visa' },
	{ id: 'cal', name: 'Visa Cal', kind: 'card', color: '#1B4E97', blurb: 'Cal-branded cards' },
	{ id: 'max', name: 'Max', kind: 'card', color: '#FF6B00', blurb: 'Formerly Leumi Card' },
	{ id: 'amex', name: 'American Express IL', kind: 'card', color: '#006FCF', blurb: 'Israel-issued Amex' },
	{ id: 'hapoalim', name: 'Bank Hapoalim', kind: 'bank', color: '#E2231A', blurb: 'Personal & business' },
	{ id: 'leumi', name: 'Bank Leumi', kind: 'bank', color: '#1976A4', blurb: 'Personal & business' },
	{ id: 'mizrahi', name: 'Mizrahi Tefahot', kind: 'bank', color: '#0066B3', blurb: 'Personal & mortgage' },
	{ id: 'discount', name: 'Bank Discount', kind: 'bank', color: '#2E9C5C', blurb: 'Personal & business' },
	{ id: 'mercantile', name: 'Mercantile Discount', kind: 'bank', color: '#1A7F4B', blurb: 'Discount group' },
	{ id: 'fibi', name: 'First International (FIBI)', kind: 'bank', color: '#003C71', blurb: 'FIBI group' },
	{ id: 'otsar', name: 'Otsar Hahayal', kind: 'bank', color: '#1A5276', blurb: 'FIBI group' },
	{ id: 'pagi', name: 'Bank Pagi', kind: 'bank', color: '#1F4E79', blurb: 'FIBI group' },
	{ id: 'yahav', name: 'Bank Yahav', kind: 'bank', color: '#005EB8', blurb: 'Civil servants (6 mo history)' },
	{ id: 'massad', name: 'Bank Massad', kind: 'bank', color: '#003E7E', blurb: 'Personal banking' },
	{ id: 'union', name: 'Union Bank', kind: 'bank', color: '#1F3864', blurb: 'Personal & business' },
	{ id: 'onezero', name: 'One Zero', kind: 'bank', color: '#000000', blurb: 'Digital bank (2FA supported)' },
	{ id: 'beyahad', name: 'Beyahad Bishvilha', kind: 'other', color: '#7B2D8E', blurb: 'Benefit scheme' },
	{ id: 'behatsdaa', name: 'Behatsdaa', kind: 'other', color: '#5F8B3A', blurb: 'Benefit scheme' },
];
