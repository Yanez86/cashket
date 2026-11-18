// SPDX-License-Identifier: AGPL-3.0-or-later
import { ACCOUNT_ICONS, type Account, type AccountKind } from '@cashket/shared';

export const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: 'checking', label: 'Conto corrente' },
  { value: 'card', label: 'Carta' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'cash', label: 'Contanti' }
];

export const kindLabel = (k: AccountKind) => ACCOUNT_KINDS.find((x) => x.value === k)?.label ?? k;
export const accountImg = (a: Pick<Account, 'kind'>) => `/accounts/${ACCOUNT_ICONS[a.kind]}.svg`;
