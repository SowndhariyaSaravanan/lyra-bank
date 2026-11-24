// Small inline icon set (no extra dependency). Decorative: hidden from assistive tech.
const paths = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z M3 7a3 3 0 0 1 3-3h11 M16 14h2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  cash: 'M3 6h18v12H3z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M6 9v.01 M18 15v.01',
  pie: 'M12 3v9h9a9 9 0 1 1-9-9z M16 3.6A9 9 0 0 1 20.4 8H16z',
  book: 'M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z M8 9h8 M8 13h8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  bank: 'M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 14l2 2 4-4',
  gauge: 'M4.5 18a9 9 0 1 1 15 0 M12 14l4-4',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  sliders: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M14 4v4 M10 10v4 M16 16v4',
  key: 'M7.5 10a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z M11.4 11.6L21 2 M16 7l3 3',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M6 6l12 12 M18 6L6 18',
  plus: 'M12 5v14 M5 12h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
};

export function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.list} /></svg>;
}
