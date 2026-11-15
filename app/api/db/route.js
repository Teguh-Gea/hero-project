import * as store from '../../../lib/server/store.js';
import { filterDb } from '../../../lib/server/access.js';
import { handler, json } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async ({ me }) => json(200, { db: filterDb(me.account, store.get()) }), { auth: true });
