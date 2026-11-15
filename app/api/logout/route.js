import * as auth from '../../../lib/server/auth.js';
import { handler, json } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async ({ me }) => {
    if (me) auth.destroySession(me.session.sid);
    return json(200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
});
