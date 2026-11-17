// SPDX-License-Identifier: AGPL-3.0-or-later
// App-wide state: the server status and the signed-in person.
import type { Status, User } from '@cashket/shared';
import { ApiError, get, session } from './api';

export const app = $state<{ status: Status | null; user: User | null }>({ status: null, user: null });

export function setUser(user: User | null) {
  app.user = user;
  applyTheme(user?.theme ?? 'system');
}

export function applyTheme(theme: User['theme']) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Status and person; the person is null when nobody is signed in. */
export async function loadSession() {
  app.status = await get<Status>('/status');
  try {
    setUser(await get<User>('/me'));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setUser(null);
    else throw e;
  }
}

session.expired = () => setUser(null);

const MESSAGES: Record<string, string> = {
  invalidCredentials: 'Email o password non corretti.',
  tooMany: 'Troppi tentativi: riprova tra qualche minuto.',
  setupDone: 'Cashket è già configurato.',
  invalidInvite: 'Questo invito non è valido o è scaduto.',
  inviteEmailMismatch: "L'invito è per un altro indirizzo email.",
  emailTaken: 'Esiste già un account con questa email.',
  invalidReset: 'Il link per la nuova password non è valido o è scaduto.',
  wrongPassword: 'La password non è corretta.',
  lastAdmin: 'Serve almeno un amministratore attivo.',
  remainderTaken: 'C\'è già un bucket che prende il resto: ne basta uno.',
  sameBucket: 'Un bucket non può mandare soldi a se stesso.',
  archivedBucket: 'Il bucket scelto è archiviato.',
  settlement: 'Solo una carta può avere un conto di addebito, e non può essere un\'altra carta.',
  periodClosed: 'Questo mese è chiuso: riaprilo per modificarlo.',
  periodOpen: 'Questo mese è già aperto.',
  nextClosed: 'Il mese successivo è chiuso: riapri prima quello.',
  notFound: 'Non trovato.',
  validation: 'Controlla i dati inseriti.',
  crossSite: 'Richiesta rifiutata.',
  unreachable: 'Il server non risponde.',
  offline: 'Sei offline: non è stato salvato.',
  unauthorized: 'Accedi di nuovo.',
  captureDone: 'Questa spesa è già stata sistemata in una sessione.',
  storageFull: 'Il telefono non ha spazio per tenere la spesa: riprova con la rete.'
};

export function errorMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : 'internal';
  return MESSAGES[code] ?? 'Qualcosa è andato storto.';
}
