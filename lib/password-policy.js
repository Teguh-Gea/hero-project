// Aturan kata sandi akun HERO. Dipakai di browser (validasi langsung di form)
// dan di server (lib/server/access.js), jadi aturannya selalu sama.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const MESSAGES = {
    required: ['Isi kata sandi.', 'Enter a password.'],
    short: [`Kata sandi minimal ${PASSWORD_MIN} karakter.`, `Password must be at least ${PASSWORD_MIN} characters.`],
    long: [`Kata sandi maksimal ${PASSWORD_MAX} karakter.`, `Password must be at most ${PASSWORD_MAX} characters.`],
    spaces: ['Kata sandi tidak boleh diawali atau diakhiri spasi.', 'Password cannot start or end with a space.'],
    mix: ['Kata sandi harus berisi huruf dan angka.', 'Password must contain letters and numbers.'],
    email: ['Kata sandi tidak boleh sama dengan email.', 'Password cannot be the same as the email.'],
    mismatch: ['Konfirmasi kata sandi tidak sama.', 'Password confirmation does not match.']
};

// Mengembalikan kode masalah pertama, atau '' jika kata sandi valid.
export function passwordProblem(password, { email = '', confirm } = {}) {
    const pw = typeof password === 'string' ? password : '';
    if (!pw) return 'required';
    if (pw.length < PASSWORD_MIN) return 'short';
    if (pw.length > PASSWORD_MAX) return 'long';
    if (pw !== pw.trim()) return 'spaces';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'mix';
    const mail = String(email || '').trim().toLowerCase();
    if (mail && (pw.toLowerCase() === mail || pw.toLowerCase() === mail.split('@')[0])) return 'email';
    if (confirm !== undefined && confirm !== pw) return 'mismatch';
    return '';
}

export function passwordMessage(code, isEn = false) {
    return code ? MESSAGES[code][isEn ? 1 : 0] : '';
}

export const PASSWORD_HINT = [
    `Minimal ${PASSWORD_MIN} karakter, berisi huruf dan angka.`,
    `At least ${PASSWORD_MIN} characters, with letters and numbers.`
];

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
