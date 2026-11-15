import { ttsEnabled, synthesize, TTS_MAX_CHARS } from '../../../lib/server/tts.js';
import { handler, json, readJson } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Suara neural HERO AI Assistant: { text, lang: 'en' | 'id' } -> { audio: base64 PCM16 24 kHz }.
// Hanya untuk pengguna yang sudah masuk. 501 jika GEMINI_API_KEY belum diset (browser memakai suara perangkat).
export const POST = handler(async ({ req }) => {
    if (!ttsEnabled()) return json(501, { error: 'Suara neural belum diaktifkan (GEMINI_API_KEY belum diset).', fallback: true });
    const body = await readJson(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > TTS_MAX_CHARS) return json(400, { error: `Teks wajib diisi (maksimal ${TTS_MAX_CHARS} karakter).` });
    const audio = await synthesize(text, body.lang === 'id' ? 'id' : 'en');
    return json(200, { audio, sampleRate: 24000 });
}, { auth: true });
