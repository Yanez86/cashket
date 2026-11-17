// SPDX-License-Identifier: AGPL-3.0-or-later
// Ready-made bucket categories. Each has an illustration in apps/web/static/categories/<key>.svg
// and a tint for the circle behind it (16% in light theme, 26% in dark, as in Mealler).

export const CATEGORIES = [
  { key: 'groceries', label: 'Spesa', tint: '#4E9E45' },
  { key: 'restaurants', label: 'Ristoranti', tint: '#E8603C' },
  { key: 'cafe', label: 'Bar e caffè', tint: '#8A5530' },
  { key: 'home', label: 'Casa', tint: '#D9704A' },
  { key: 'utilities', label: 'Bollette', tint: '#F5B83D' },
  { key: 'transport', label: 'Trasporti', tint: '#2A9D8F' },
  { key: 'fuel', label: 'Carburante', tint: '#7FB236' },
  { key: 'car', label: 'Auto', tint: '#4D8FD1' },
  { key: 'health', label: 'Salute', tint: '#E04F3F' },
  { key: 'sport', label: 'Sport', tint: '#3F6FD8' },
  { key: 'leisure', label: 'Svago', tint: '#F27BA5' },
  { key: 'subscriptions', label: 'Abbonamenti', tint: '#64748B' },
  { key: 'phone', label: 'Telefono e internet', tint: '#38A3D1' },
  { key: 'clothing', label: 'Abbigliamento', tint: '#D6457A' },
  { key: 'gifts', label: 'Regali', tint: '#8B5CF6' },
  { key: 'pets', label: 'Animali', tint: '#C98A4B' },
  { key: 'education', label: 'Istruzione', tint: '#5B8DEF' },
  { key: 'personal-care', label: 'Cura personale', tint: '#C084FC' },
  { key: 'holidays', label: 'Vacanze', tint: '#F7A440' },
  { key: 'savings', label: 'Risparmio', tint: '#F29BB5' },
  { key: 'taxes', label: 'Tasse', tint: '#B45309' },
  { key: 'insurance', label: 'Assicurazioni', tint: '#0E7490' },
  { key: 'kids', label: 'Bambini', tint: '#E8B020' },
  { key: 'salary', label: 'Stipendio', tint: '#16A34A' },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

/** Colours a custom category can take: a tag with the first letter of its name. */
export const CUSTOM_COLORS = ['#4E9E45', '#2A9D8F', '#38A3D1', '#3F6FD8', '#8B5CF6', '#D6457A', '#E8603C', '#E2874A', '#C99A3E', '#64748B'] as const;

/** A bucket shows either a ready-made category or a custom tag. */
export type BucketIcon = { kind: 'category'; key: CategoryKey } | { kind: 'custom'; letter: string; color: string };

/** Illustration for each account kind, in apps/web/static/accounts/<file>.svg. */
export const ACCOUNT_ICONS = { checking: 'checking', card: 'card', paypal: 'card', cash: 'cash' } as const;

export function categoryByKey(key: string) {
  return CATEGORIES.find((c) => c.key === key);
}
