import { json } from '../../../lib/server/http.js';

export const dynamic = 'force-dynamic';

// Endpoint API yang tidak dikenal dijawab JSON, bukan halaman 404 HTML
const notFound = () => json(404, { error: 'Endpoint tidak ditemukan.' });
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
