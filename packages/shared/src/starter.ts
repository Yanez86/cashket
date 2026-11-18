// SPDX-License-Identifier: AGPL-3.0-or-later
// The recommended buckets every new person starts with (or skips to), all editable and deletable.
import type { CategoryKey } from './categories.ts';
import type { BucketKind } from './types.ts';

export interface StarterBucket {
  name: string;
  category: CategoryKey;
  kind: BucketKind;
  /** Share of base income; null = takes what is left. */
  percent: number | null;
}

export const STARTER_BUCKETS: StarterBucket[] = [
  { name: 'Casa', category: 'home', kind: 'spend', percent: 25 },
  { name: 'Spesa', category: 'groceries', kind: 'spend', percent: 15 },
  { name: 'Bollette', category: 'utilities', kind: 'spend', percent: 8 },
  { name: 'Trasporti', category: 'transport', kind: 'spend', percent: 8 },
  { name: 'Svago', category: 'leisure', kind: 'spend', percent: 7 },
  { name: 'Ristoranti', category: 'restaurants', kind: 'spend', percent: 5 },
  { name: 'Salute', category: 'health', kind: 'spend', percent: 3 },
  { name: 'Abbonamenti', category: 'subscriptions', kind: 'spend', percent: 2 },
  { name: 'Vacanze', category: 'holidays', kind: 'saving', percent: 5 },
  { name: 'Fondo emergenze', category: 'insurance', kind: 'saving', percent: 5 },
  { name: 'Risparmio', category: 'savings', kind: 'saving', percent: null }
];

/** Version and what changed, newest first: shown in "Informazioni su Cashket". */
export const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '0.7.0',
    date: '2026-11-18',
    items: [
      'Tutorial al primo accesso, con conti e bucket consigliati; si può saltare e rivedere.',
      'Azzera l\'account dal profilo.',
      'Scorri a sinistra per eliminare o archiviare conti, bucket, entrate e spese in coda.',
      'Conti modificabili, archiviati in fondo; menu e date nello stile dell\'app.',
      'Pulsante + per una spesa al volo nella home e nella coda.',
      'Pagina Informazioni su Cashket.'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-11-18',
    items: ['Andamento: entrate e spese per mese, spese per bucket.', 'Import automatico dalla banca con Enable Banking.', 'Promemoria della sessione e notifiche.']
  },
  {
    version: '0.3.0',
    date: '2026-11-17',
    items: ['Sessione di riconciliazione: import CSV, abbinamento, regole, revisione.', 'Coda delle spese anche offline.', 'Bucket, conti, entrate, mese di budget.']
  }
];
