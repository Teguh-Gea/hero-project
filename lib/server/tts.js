// Suara neural HERO AI Assistant lewat Gemini TTS, dipanggil dari server agar API key tidak pernah
// sampai ke browser. Aktif jika GEMINI_API_KEY diset (Vercel: Settings → Environment Variables).
// Tanpa key, browser memakai suara bawaan perangkat yang paling natural.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
export const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
// Sulafat = suara Gemini yang hangat; bisa diganti lewat GEMINI_TTS_VOICE (mis. Achernar, Aoede, Kore)
export const TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Sulafat';
export const TTS_MAX_CHARS = 600;

const STYLE = {
    en: 'Read this aloud in a warm, calm and natural conversational voice, like a friendly medical assistant talking with a colleague. Use natural pauses and do not sound robotic',
    id: 'Bacakan dalam Bahasa Indonesia dengan suara yang hangat, tenang, dan natural seperti asisten medis yang ramah sedang berbicara dengan rekannya. Gunakan jeda yang wajar dan jangan terdengar seperti robot'
};

export function ttsEnabled() {
    return !!process.env.GEMINI_API_KEY;
}

// Mengembalikan audio PCM 16-bit mono 24 kHz (base64), atau melempar error
export async function synthesize(text, lang = 'en') {
    const res = await fetch(`${API}/${TTS_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
            contents: [{ parts: [{ text: `${STYLE[lang === 'id' ? 'id' : 'en']}: ${text}` }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } }
            }
        }),
        signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw Object.assign(new Error(`Gemini TTS membalas ${res.status}.`), { status: 502 });
    const data = await res.json();
    const audio = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data || null;
    if (!audio) throw Object.assign(new Error('Gemini TTS tidak mengembalikan audio.'), { status: 502 });
    return audio;
}
