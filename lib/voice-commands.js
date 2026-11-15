// Pengenalan perintah suara/ketik HERO AI Assistant dan daftar perintahnya.
// Modul murni (tanpa React) agar setiap frasa di daftar perintah bisa diuji otomatis
// (tests/voice-commands.test.js): frasa yang tampil di daftar pasti dipahami asisten.

// Detektor Wake-Word "Hai HERO" / "Hi HERO" dengan Mode Ketat (Strict Anti-Noise) saat Minimize
export function detectHeroWakeWord(rawText, strictStandby = false) {
    if (!rawText)
        return { matched: false, stripped: '' };
    const norm = rawText
        .toLowerCase()
        .replace(/[.,!?'"-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // Saat mode Minimize/Standby, gunakan pola EKSPLISIT "Hai/Hi/Halo/Hey + Hero/Hiro"
    // agar noise ruangan, desis napas, atau kata acak tidak pernah memicu AI secara tidak sengaja.
    if (strictStandby) {
        const strictWakeRegex = /\b(hi|hai|hey|hei|halo|hello)\s+(hero|hiro|herro)\b|\b(hihero|haihero|heyhero|halohero)\b/i;
        const strictMatch = norm.match(strictWakeRegex);
        if (strictMatch) {
            const idx = norm.indexOf(strictMatch[0].toLowerCase());
            const afterWake = norm.slice(idx + strictMatch[0].length).trim();
            return { matched: true, stripped: afterWake };
        }
        return { matched: false, stripped: norm };
    }
    // Saat HUD sudah terbuka, izinkan variasi fonetik yang sedikit lebih fleksibel
    const wakeRegex = /\b(hi|hai|hey|hei|halo|hello|hay)\s*(hero|hiro|heru|herro|hyro)\b|\b(hihero|haihero|heyhero|halohero|haihiro|hihiro)\b/i;
    const match = norm.match(wakeRegex);
    if (match) {
        const idx = norm.indexOf(match[0].toLowerCase());
        const afterWake = norm.slice(idx + match[0].length).trim();
        return { matched: true, stripped: afterWake };
    }
    if (/^(hero|hiro)\b/i.test(norm)) {
        const stripped = norm.replace(/^(hero|hiro)\b\s*/i, '').trim();
        return { matched: true, stripped };
    }
    return { matched: false, stripped: norm };
}
// Detektor Interupsi / Barge-In (Bilingual ID & EN): Memungkinkan user memotong ucapan HERO
export function detectVoiceBargeIn(rawText) {
    if (!rawText)
        return { isBargeIn: false, correctionQuery: '' };
    const norm = rawText
        .toLowerCase()
        .replace(/[.,!?'"-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const bargeRx = /\b(stop|berhenti|bukan|salah|keliru|potong|koreksi|tunggu|sebentar|ulangi|ganti|batal|enggak|tidak|maksud saya|maksudku|bukan itu|eh salah|hai hero stop|hi hero stop|aktifkan|aktifin|nyalakan|nyalain|matikan|nonaktifkan|wait|hold on|wrong|no|incorrect|cancel|i mean|i meant|activate|enable|turn on|disable|turn off|deactivate)\b/i;
    if (!bargeRx.test(norm)) {
        return { isBargeIn: false, correctionQuery: '' };
    }
    if (/\b(aktifkan|aktifin|nyalakan|nyalain|matikan|nonaktifkan|activate|enable|turn on|disable|turn off|deactivate)\b/i.test(norm) &&
        !/\b(stop|berhenti|bukan|salah|keliru|potong|koreksi|tunggu|sebentar|batal|wait|hold on|wrong|incorrect|cancel)\b/i.test(norm)) {
        return { isBargeIn: true, correctionQuery: norm };
    }
    const correctionQuery = norm
        .replace(/^.*?\b(hai|hi|halo|hey|hello)?\s*(hero|hiro)?\s*(stop|berhenti|tunggu|sebentar|potong|ulangi|batal|wait|hold on|cancel)\b[,.\s!]*/i, '')
        .replace(/^.*?\b(eh\s+)?(bukan|salah|keliru|koreksi|enggak|tidak|wrong|no|incorrect)(\s+itu|\s+that)?[,.\s!]*(maksud\s+saya|maksudku|yang\s+saya\s+maksud|saya\s+minta|saya\s+ingin|saya\s+mau|tolong|i\s+mean|i\s+meant|please)?[,.\s!]*/i, '')
        .replace(/^.*?\b(maksud\s+saya|maksudku|yang\s+saya\s+maksud|i\s+mean|i\s+meant)\b[,.\s!]*/i, '')
        .trim();
    return { isBargeIn: true, correctionQuery };
}
const ASTRO_NAME_TITLES = new Set(['cmdr', 'dr', 'spec', 'capt', 'lt', 'eng', 'mr', 'mrs', 'ms', 'prof', 'mission', 'specialist']);
// Pengenal perintah spesifik website (dijalankan sebelum mesin fuzzy biomarker)
export function resolveSiteCommand(rawInput, astronauts, voiceModels) {
    const norm = (rawInput || '')
        .toLowerCase()
        .replace(/[.,!?'"–—-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!norm)
        return null;
    const has = (re) => re.test(norm);
    const asks = has(/\b(jelaskan|bacakan|berapa|kenapa|mengapa|bagaimana|gimana|apa|apakah|analisis|explain|read|why|how|what|analyze)\b/);
    if (has(/\b(daftar|list|lihat|tampilkan|show|buka|open)\s*(semua\s*|all\s*)?(perintah|command|commands|komando)\b|\b(bantuan|help|what can i say)\b|\bperintah apa( saja)?\b/)) {
        return { type: 'help' };
    }
    if (has(/\b(log\s*out|logout|sign\s*out|keluar\s*(dari\s*)?(akun|aplikasi|sistem|sso))\b/)) {
        return { type: 'logout' };
    }
    if (has(/\b(matikan|nonaktifkan|non aktifkan|disable|turn\s*off|stop)\s*(mikrofon|microphone|mic|mik|wake\s*word|hai hero|hi hero)\b/)) {
        return { type: 'mic_off' };
    }
    if (has(/\b(bahasa|language)\s*(ke\s*)?(inggris|english)\b|\b(switch|change)\s*(language\s*)?(to\s*)?english\b|\bspeak english\b/)) {
        return { type: 'lang', lang: 'en' };
    }
    if (has(/\b(bahasa|language)\s*(ke\s*)?(indonesia|indonesian)\b|\b(switch|change)\s*(language\s*)?(to\s*)?(indonesia|indonesian)\b|\bspeak indonesian\b/)) {
        return { type: 'lang', lang: 'id' };
    }
    if (has(/\b(tambah|tambahkan|tambahin|buat|bikin|daftarkan|input|masukkan)\s*(sebuah\s*|seorang\s*)?(astronot|astronaut|kru|crew|anggota kru)\b|\b(astronot|astronaut|kru|crew)\s*baru\b|\badd\s*(a\s*|an\s*)?(new\s*)?(astronaut|crew)\b|\bnew\s*(astronaut|crew member)\b/)) {
        return { type: 'sim', mode: 'new_astro' };
    }
    if (has(/\b(tambah|tambahkan|tambahin|input|masukkan|masukin|catat|rekam)\s*(data|hasil|pemeriksaan|scan|telemetri)\b|\b(data|pemeriksaan|scan)\s*baru\b|\badd\s*(a\s*)?(new\s*)?(data|scan|record|examination)\b|\bnew\s*(scan|record|examination)\b/)) {
        return { type: 'sim', mode: 'new_scan' };
    }
    if (has(/\b(ubah|edit|koreksi|perbarui|update|revisi|sunting)\b/) && has(/\b(data|profil|profile|nilai|record|astronot|astronaut)\b/)) {
        return { type: 'sim', mode: 'edit' };
    }
    if (has(/\b(buka|open|masuk ke|go to)\s*(halaman\s*)?(simulasi|simulator|input)\b|\b(input simulator|simulasi input)\b/)) {
        return { type: 'sim', mode: 'open' };
    }
    // Halaman aplikasi. Hak akses diperiksa saat dijalankan (Misi, Pengguna, Riset & SQL khusus Admin).
    const opens = '(?:buka|bukakan|open|go\\s*to|pergi\\s*ke|ke|tampilkan|show)\\s*(?:halaman\\s*|menu\\s*|page\\s*|the\\s*)?';
    if (new RegExp(`\\b${opens}(?:pengguna|users?|user\\s*management|manajemen\\s*pengguna|akun\\s*pengguna|accounts?)\\b`).test(norm)) {
        return { type: 'tab', tab: 'users' };
    }
    if (new RegExp(`\\b${opens}(?:misi|missions?)(?:\\s*(?:page|list|management))?$`).test(norm) || has(/\b(halaman|menu|kelola|manajemen)\s*misi\b|\bmission\s*(page|management)\b|\bmanage\s*missions\b/)) {
        return { type: 'tab', tab: 'missions' };
    }
    if (new RegExp(`\\b${opens}(?:daftar\\s*kru|kru|crew(?:\\s*list)?|registrasi|registration)\\b`).test(norm)) {
        return { type: 'tab', tab: 'register' };
    }
    if (new RegExp(`\\b${opens}(?:riset|research|sql|database|skema|schema)\\b`).test(norm)) {
        return { type: 'tab', tab: 'sql' };
    }
    if (has(/\b(buka|kembali\s*ke|ke|open|go\s*to|back\s*to)\s*(halaman\s*)?(dashboard|beranda|halaman utama|home)\b|^(dashboard|beranda|home)$/)) {
        return { type: 'dashboard' };
    }
    if (has(/\b(semua|all)\s*(misi|missions?)\b|\b(hapus|reset|clear)\s*filter\b/)) {
        return { type: 'mission', inc: 'ALL' };
    }
    const missionMatch = norm.match(/\b(?:misi|mission|inc)\s*(?:inc\s*)?0*(\d{1,4})\b/);
    if (missionMatch) {
        const n = Number(missionMatch[1]);
        const inc = Array.from(new Set(astronauts.map((a) => a.inc))).find((i) => Number(String(i).replace(/\D/g, '')) === n);
        if (inc)
            return { type: 'mission', inc };
    }
    if (has(/\b(astronot|astronaut|kru|crew)\s*(berikutnya|selanjutnya|lainnya|next)\b|\bnext\s*(astronaut|crew)\b/)) {
        return { type: 'astro_step', dir: 1 };
    }
    if (has(/\b(astronot|astronaut|kru|crew)\s*(sebelumnya|previous|prev)\b|\bprevious\s*(astronaut|crew)\b/)) {
        return { type: 'astro_step', dir: -1 };
    }
    const dayMatch = norm.match(/\b(?:hari|day|d)\s*(?:ke\s*)?\+?\s*(\d{1,4})\b/);
    const day = dayMatch ? Number(dayMatch[1]) : null;
    const idMatch = norm.match(/\b(?:ast|astronot|astronaut|id)\s*0*(\d{1,4})\b/);
    let picked = null;
    if (idMatch) {
        const n = Number(idMatch[1]);
        picked = astronauts.find((a) => Number(String(a.id).replace(/\D/g, '')) === n) || null;
    }
    if (!picked) {
        picked =
            astronauts.find((a) => {
                const tokens = String(a.name || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
                    .filter((t) => t.length >= 3 && !ASTRO_NAME_TITLES.has(t));
                return tokens.some((t) => new RegExp(`\\b${t}\\b`).test(norm));
            }) || null;
    }
    if (picked && !asks)
        return { type: 'select_astro', astroId: picked.id, day };
    if (has(/\b(scan|data|pemeriksaan|hari)\s*(berikutnya|selanjutnya)\b|\bnext\s*(scan|day|record)\b/))
        return { type: 'scan_step', dir: 1 };
    if (has(/\b(scan|data|pemeriksaan|hari)\s*(sebelumnya)\b|\b(previous|prev)\s*(scan|day|record)\b/))
        return { type: 'scan_step', dir: -1 };
    if (has(/\b(scan|data|pemeriksaan)\s*(terakhir|terbaru)\b|\b(latest|last|newest)\s*(scan|data|record)\b/))
        return { type: 'scan_edge', edge: 'last' };
    if (has(/\b(scan|data|pemeriksaan)\s*(pertama|awal|terlama)\b|\b(first|earliest|oldest)\s*(scan|data|record)\b/))
        return { type: 'scan_edge', edge: 'first' };
    if (day !== null && !asks)
        return { type: 'day', day };
    const wantsToggle = has(/\b(aktifkan|aktifin|nyalakan|matikan|nonaktifkan|activate|deactivate|enable|disable|turn on|turn off)\b/);
    if (!asks && !wantsToggle) {
        if (has(/\b(skor|score|scores|readiness|kesiapan)\b/))
            return { type: 'section', section: 'scores', category: 'all' };
        if (has(/\b(biomarker|biomarkers|21 variabel|21 variables)\b/))
            return { type: 'section', section: 'biomarkers', category: 'all' };
        if (has(/\b(rekomendasi|recommendations?|countermeasures?|mitigasi|mitigation)\b/))
            return { type: 'section', section: 'countermeasures', category: 'copilot' };
    }
    return null;
}
// Mesin Fuzzy Intent & Toleransi Typo (Bilingual ID & EN)
export function resolveFuzzyHeroIntent(rawInput, lang = 'id') {
    const isEn = lang === 'en';
    const norm = (rawInput || '')
        .toLowerCase()
        .replace(/[.,!?'"-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const mentionsCo2Rx = /\b(co2|co\s*2|c\s*o\s*2|c\s*o\s*dua|co\s*dua|ceo\s*2|ceo\s*dua|se\s*o\s*2|se\s*o\s*dua|c02|so2|so\s*2|karbon|karbondioksida|carbon|cdra|c\s*d\s*r\s*a|scrubber|skraber|natrium|sodium|garam|eclss|e\s*c\s*l\s*s\s*s)\b/i.test(norm);
    const mentionsHrvRx = /\b(hrv|h\s*r\s*v|ha\s*er\s*ve|ha\s*er\s*fe|h\s*r\s*f|hrf|harv|hrp|h\s*r\s*p|earv|vagal|fagal|pagal|biofeedback|bio\s*feedback|napas|nafas|pernapasan|pernafasan|breathing|detak\s*jantung|jantung|heart\s*rate|sla|s\s*l\s*a)\b/i.test(norm);
    const mentionsLbnpRx = /\b(lbnp|l\s*b\s*n\s*p|el\s*be\s*en\s*pe|lbmp|lmbp|lnbp|ldnp|ebnp|elbmp|lbn|l\s*b\s*n|rbp|abnp|chibis|cibis|kibis|sibis|hibis|vakum|vacuum)\b/i.test(norm);
    const fixed = norm
        .replace(/\b(el\s*be\s*en\s*pe|l\s*b\s*n\s*p|lbmp|lmbp|lnbp|ldnp|ebnp|elbmp|lbn|chibis|cibis|kibis|sibis|hibis|vakum|vacuum)\b/g, 'lbnp')
        .replace(/\b(co2|co\s*2|c\s*o\s*2|c\s*o\s*dua|co\s*dua|ceo\s*2|ceo\s*dua|se\s*o\s*2|se\s*o\s*dua|c02|so2|so\s*2|karbon|karbondioksida|carbon|cdra|scrubber|skraber)\b/g, 'co2_rx')
        .replace(/\b(hrv|h\s*r\s*v|ha\s*er\s*ve|ha\s*er\s*fe|h\s*r\s*f|hrf|harv|hrp|h\s*r\s*p|earv|vagal|fagal|pagal|biofeedback)\b/g, 'hrv_rx')
        .replace(/\b(o\s*c\s*t|okt|ositi|osit|oct2|mataku|optik|optic|ocular|eye|eyes|rnfl|gcipl|vcdr|cst|koroid|choroid|retina|retinal|sans)\b/g, 'oct')
        .replace(/\b(b\s*h\s*p|mntal|mental|psikolog|psikis|stres|stress|tidur|sleep|sws|pvt|wajah|facial|facs|eda|kognitif|cognitive|fatigue|burnout)\b/g, 'bhp')
        .replace(/\b(i\s*s\s*s|e\s*c\s*l\s*s\s*s|ess|eclss|lingkungan|kabin|cabin|environment|radiasi|radiation|bising|noise|voc|udara|air|suhu|temperature|lembap|humidity|sirkadian|circadian|lux|wrs|natrium|sodium|garam)\b/g, 'env')
        .replace(/\b(kembar|digital\s*twin|3d|fundus|sagital|sagittal|peta\s*mata|bola\s*mata)\b/g, 'twin')
        .replace(/\b(dta|dt|datanya|rekam|medis|biomarker|biomarkers|variabel|variables|kondisi|condition|status|hasil|results|cek|check|lihat|show|view|tunjuk|tampil|display)\b/g, 'data')
        .replace(/\b(aktif|aktifkan|aktif\s*kan|mengaktifkan|aktifin|aktikan|aktifan|nyalakan|nyalain|nyala|menyalakan|jalankan|jalanin|terapkan|terapin|pakai|gunakan|pasang|mulai|hidupkan|hidupin|klik|pencet|activate|enable|turn\s*on|start|apply|run)\b/g, 'activate')
        .replace(/\b(matikan|nonaktifkan|non\s*aktifkan|nonaktif|lepas|batalkan|hentikan|deactivate|disable|turn\s*off|stop\s*protocol)\b/g, 'deactivate');
    const isQuestionAboutData = /\b(jelaskan|bacakan|berapa|apa\s*itu|kenapa|mengapa|explain|read|what\s*is|why|how\s*is)\b/i.test(norm);
    const wantsActivate = /\b(activate)\b/i.test(fixed) ||
        /\b(ingin|mau|tolong|coba|please|want\s*to)\s+(mengaktifkan|aktif|nyala|jalan|terap|pasang|activate|enable|turn\s*on)/i.test(norm) ||
        (!isQuestionAboutData &&
            /\b(protokol|protocol|intervensi|intervention|countermeasure|terapi|therapy)\s*(co2|co\s*2|hrv|h\s*r\s*v|lbnp|chibis|vagal|cdra)\b/i.test(norm));
    const wantsDeactivate = /\b(deactivate)\b/i.test(fixed);
    if (wantsActivate || wantsDeactivate) {
        const targetState = !wantsDeactivate;
        if (/\b(semua|ketiga|tiga|all|both|everything)\b/i.test(norm) || (mentionsCo2Rx && mentionsHrvRx && mentionsLbnpRx)) {
            return {
                type: 'toggle_rx',
                rxKey: 'all',
                targetState,
                label: isEn
                    ? 'All Intervention Protocols (LBNP, CO₂, and HRV)'
                    : 'Semua Protokol Intervensi (LBNP, CO₂, dan HRV)'
            };
        }
        if (mentionsCo2Rx && mentionsHrvRx) {
            return {
                type: 'toggle_rx',
                rxKey: 'co2_hrv',
                targetState,
                label: isEn
                    ? 'CO₂ Protocol (ISS ECLSS) & HRV Protocol (BHP Vagal)'
                    : 'Protokol CO₂ (ISS ECLSS) & Protokol HRV (BHP Vagal)'
            };
        }
        if (mentionsCo2Rx || /\b(co2_rx|env)\b/i.test(fixed)) {
            return {
                type: 'toggle_rx',
                rxKey: 'env',
                targetState,
                label: isEn
                    ? 'CO₂ Protocol (CDRA Scrubber ≤2 mmHg & Low Sodium)'
                    : 'Protokol CO₂ (CDRA Scrubber ≤2 mmHg & Restriksi Natrium)'
            };
        }
        if (mentionsHrvRx || (/\b(hrv_rx|bhp)\b/i.test(fixed) && !mentionsLbnpRx)) {
            return {
                type: 'toggle_rx',
                rxKey: 'bhp',
                targetState,
                label: isEn
                    ? 'HRV Protocol (0.1 Hz Vagal Biofeedback & SLA Circadian)'
                    : 'Protokol HRV (Biofeedback Vagal 0.1 Hz & Sirkadian SLA)'
            };
        }
        return {
            type: 'toggle_rx',
            rxKey: 'lbnp',
            targetState,
            label: isEn
                ? 'Chibis LBNP Protocol (-35 mmHg)'
                : 'Protokol Chibis LBNP (-35 mmHg)'
        };
    }
    if (/\b(simulasi|simulation|simulator|input|masukin|upload|tambah\s*data|add\s*data)\b/i.test(norm)) {
        return {
            type: 'nav_tab',
            tab: 'input',
            label: isEn ? 'Tri-Modal Data Input Simulator' : 'Simulasi Input Data Tri-Modal'
        };
    }
    if (/\b(registrasi|register|registration|daftar\s*kru|tambah\s*kru|user\s*baru|new\s*crew)\b/i.test(norm)) {
        return {
            type: 'nav_tab',
            tab: 'register',
            label: isEn ? 'Astronaut Crew Registration' : 'Registrasi Kru Astronot'
        };
    }
    if (/\b(sql|database|skema|schema|osdr|riset\s*nasa|nasa\s*research)\b/i.test(norm)) {
        return {
            type: 'nav_tab',
            tab: 'sql',
            label: isEn ? 'NASA Research Architecture & SQL Schema' : 'Arsitektur Riset NASA & Database SQL'
        };
    }
    if (/\b(data\s*diri|profil|profile|identitas|ke\s*atas|bagian\s*atas|halaman\s*atas|ringkasan\s*utama|dashboard\s*utama|main\s*dashboard|top\s*section|overview)\b/i.test(norm)) {
        return {
            type: 'show_data',
            category: 'all',
            section: 'top',
            label: isEn ? 'Astronaut Profile & Main Summary' : 'Data Diri & Ringkasan Utama Astronot'
        };
    }
    const hasOct = /\b(oct)\b/i.test(fixed);
    const hasBhp = /\b(bhp|hrv_rx)\b/i.test(fixed);
    const hasEnv = /\b(env|co2_rx)\b/i.test(fixed);
    const hasTwin = /\b(twin)\b/i.test(fixed);
    if (hasTwin) {
        return {
            type: 'show_data',
            category: 'twin',
            section: 'twin',
            label: isEn
                ? '3D Ocular Digital Twin (12-Clock Fundus & Sagittal)'
                : 'Kembar Digital Mata 3D (Fundus 12-Jam & Sagital)'
        };
    }
    if ((hasOct && hasBhp) || (hasOct && hasEnv) || (hasBhp && hasEnv) || /\b(semua|all|21|lengkap|full|tri\s*modal|ketiga|tujuh\s*data|7\s*data)\b/i.test(norm)) {
        return {
            type: 'show_data',
            category: 'all',
            section: 'top',
            label: isEn
                ? 'Full Profile & All 21 Tri-Modal Biomarkers'
                : 'Semua Data Diri & 21 Biomarker Tri-Modal'
        };
    }
    if (hasOct) {
        return {
            type: 'show_data',
            category: 'oct7',
            section: 'biomarkers',
            label: isEn ? '7 Core Ocular OCT Variables (SANS)' : '7 Variabel Inti Ocular OCT (SANS)'
        };
    }
    if (hasBhp) {
        return {
            type: 'show_data',
            category: 'bhp7',
            section: 'biomarkers',
            label: isEn
                ? '7 Mental & Cognitive Health Variables (BHP)'
                : '7 Variabel Kesehatan Mental & Kognitif (BHP)'
        };
    }
    if (hasEnv) {
        return {
            type: 'show_data',
            category: 'env7',
            section: 'biomarkers',
            label: isEn
                ? '7 ISS Cabin Environment Variables (ECLSS)'
                : '7 Variabel Lingkungan Kabin ISS (ECLSS)'
        };
    }
    if (/\b(saran|rekomendasi|recommendations?|recommend|advice|terapi|therapy|mitigasi|mitigation|protokol|protocol|intervensi|solusi|obat|countermeasure|countermeasures)\b/i.test(norm)) {
        return {
            type: 'show_data',
            category: 'copilot',
            section: 'countermeasures',
            label: isEn
                ? 'Recommended Mitigation & Countermeasure Protocols'
                : 'Rekomendasi Protokol Mitigasi & Countermeasures'
        };
    }
    return {
        type: 'show_data',
        category: 'all',
        section: 'top',
        label: isEn ? 'Astronaut Profile & Health Dashboard' : 'Data Diri & Dashboard Utama Kesehatan'
    };
}

// ============================================================================
// DAFTAR PERINTAH (sesuai role)
// ============================================================================
export const HERO_COMMAND_GROUPS = [
    { key: 'nav', id: 'Navigasi halaman', en: 'Pages' },
    { key: 'astro', id: 'Data astronot', en: 'Astronaut data' },
    { key: 'time', id: 'Timeline pemeriksaan', en: 'Examination timeline' },
    { key: 'view', id: 'Tampilan dashboard', en: 'Dashboard views' },
    { key: 'rx', id: 'Protokol intervensi (Admin)', en: 'Intervention protocols (Admin)' },
    { key: 'ask', id: 'Tanya HERO', en: 'Ask HERO' },
    { key: 'sys', id: 'Suara & sistem', en: 'Voice & system' }
];

// Nama panggilan astronot (tanpa gelar), untuk contoh "Pilih astronot Raka"
export function astronautCallName(name) {
    const t = String(name || '').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !ASTRO_NAME_TITLES.has(w.toLowerCase()));
    return t[0] || '';
}

// Daftar perintah untuk role & data yang sedang terlihat.
//   expect: hasil yang diharapkan dari pengenal perintah (dipakai uji otomatis)
//   admin: true -> hanya tampil untuk Admin
export function buildCommandCatalog({ isAdmin = false, astronauts = [], missions = [] } = {}) {
    const other = astronauts[1] || astronauts[0];
    const callName = other ? astronautCallName(other.name) : '';
    const missionId = missions[0] || '';
    const list = [
        { g: 'nav', en: 'Open dashboard', id: 'Buka dashboard', aen: 'Back to the main dashboard, scrolled to the top', aid: 'Kembali ke dashboard utama, di bagian paling atas', expect: { site: 'dashboard' } },
        { g: 'nav', en: 'Open crew list', id: 'Buka daftar kru', aen: 'Opens the Crew page', aid: 'Membuka halaman Kru', expect: { site: 'tab', tab: 'register' } },
        { g: 'nav', en: 'Open input simulator', id: 'Buka simulasi input', aen: 'Opens the Input simulator for the active astronaut', aid: 'Membuka Simulasi input untuk astronot yang aktif', expect: { site: 'sim', mode: 'open' } },
        { g: 'nav', admin: true, en: 'Open missions', id: 'Buka halaman misi', aen: 'Opens the Missions page (missions, cabins & cabin leaders)', aid: 'Membuka halaman Misi (misi, kabin & pemimpin kabin)', expect: { site: 'tab', tab: 'missions' } },
        { g: 'nav', admin: true, en: 'Open users', id: 'Buka halaman pengguna', aen: 'Opens the Users page (accounts & Admin roles)', aid: 'Membuka halaman Pengguna (akun & role Admin)', expect: { site: 'tab', tab: 'users' } },
        { g: 'nav', admin: true, en: 'Open research and SQL', id: 'Buka riset dan SQL', aen: 'Opens the Research & SQL page', aid: 'Membuka halaman Riset & SQL', expect: { site: 'tab', tab: 'sql' } },
        { g: 'nav', en: 'Show command list', id: 'Tampilkan daftar perintah', aen: 'Shows this list', aid: 'Menampilkan daftar ini', expect: { site: 'help' } },

        { g: 'astro', admin: true, en: 'Add astronaut', id: 'Tambahkan astronot', aen: 'Opens the new astronaut form', aid: 'Membuka form astronot baru', expect: { site: 'sim', mode: 'new_astro' } },
        { g: 'astro', en: 'Add new scan', id: 'Tambah data pemeriksaan', aen: 'Opens a new examination record for the active astronaut', aid: 'Membuka data pemeriksaan baru untuk astronot yang aktif', expect: { site: 'sim', mode: 'new_scan' } },
        { g: 'astro', en: 'Edit astronaut data', id: 'Ubah data astronot', aen: 'Opens the record you are viewing for editing', aid: 'Membuka data yang sedang dilihat untuk diubah', expect: { site: 'sim', mode: 'edit' } },
        ...(callName && astronauts.length > 1 ? [{ g: 'astro', en: `Select astronaut ${callName}`, id: `Pilih astronot ${callName}`, aen: 'Switches to an astronaut by name or ID', aid: 'Berpindah ke astronot lain berdasarkan nama atau ID', expect: { site: 'select_astro' } }] : []),
        ...(astronauts.length > 1 ? [
            { g: 'astro', en: 'Next astronaut', id: 'Astronot berikutnya', aen: 'Moves to the next astronaut', aid: 'Pindah ke astronot berikutnya', expect: { site: 'astro_step' } },
            { g: 'astro', en: 'Previous astronaut', id: 'Astronot sebelumnya', aen: 'Moves to the previous astronaut', aid: 'Pindah ke astronot sebelumnya', expect: { site: 'astro_step' } }
        ] : []),
        ...(missionId ? [{ g: 'astro', admin: true, en: `Show mission ${missionId}`, id: `Tampilkan misi ${missionId}`, aen: 'Shows only the crew of that mission', aid: 'Menampilkan kru misi itu saja', expect: { site: 'mission' } }] : []),
        { g: 'astro', admin: true, en: 'Show all missions', id: 'Tampilkan semua misi', aen: 'Removes the mission filter', aid: 'Menghapus filter misi', expect: { site: 'mission' } },

        { g: 'time', en: 'Day 30', id: 'Hari ke 30', aen: 'Jumps to mission day D+30', aid: 'Melompat ke hari misi D+30', expect: { site: 'day' } },
        { g: 'time', en: 'Next scan', id: 'Scan berikutnya', aen: 'Next examination record', aid: 'Data pemeriksaan berikutnya', expect: { site: 'scan_step' } },
        { g: 'time', en: 'Previous scan', id: 'Scan sebelumnya', aen: 'Previous examination record', aid: 'Data pemeriksaan sebelumnya', expect: { site: 'scan_step' } },
        { g: 'time', en: 'Latest scan', id: 'Data terbaru', aen: 'Most recent examination record', aid: 'Data pemeriksaan paling akhir', expect: { site: 'scan_edge' } },
        { g: 'time', en: 'First scan', id: 'Data pertama', aen: 'Earliest examination record', aid: 'Data pemeriksaan paling awal', expect: { site: 'scan_edge' } },

        { g: 'view', en: 'Show profile overview', id: 'Tampilkan data diri', aen: 'Profile and main summary at the top', aid: 'Data diri & ringkasan utama di bagian atas', expect: { fuzzy: 'show_data', section: 'top' } },
        { g: 'view', en: 'Show scores', id: 'Tampilkan skor', aen: 'SANS, BHP, cabin and readiness scores', aid: 'Skor SANS, BHP, kabin & kesiapan', expect: { site: 'section' } },
        { g: 'view', en: 'Show OCT data', id: 'Tampilkan data OCT', aen: 'The 7 eye (OCT) variables', aid: '7 variabel mata (OCT)', expect: { fuzzy: 'show_data', category: 'oct7' } },
        { g: 'view', en: 'Show mental data', id: 'Tampilkan data mental', aen: 'The 7 mental health (BHP) variables', aid: '7 variabel kesehatan mental (BHP)', expect: { fuzzy: 'show_data', category: 'bhp7' } },
        { g: 'view', en: 'Show cabin environment data', id: 'Tampilkan data lingkungan kabin', aen: 'The 7 ISS cabin environment variables', aid: '7 variabel lingkungan kabin ISS', expect: { fuzzy: 'show_data', category: 'env7' } },
        { g: 'view', en: 'Show all biomarkers', id: 'Tampilkan semua biomarker', aen: 'All 21 biomarker cards', aid: 'Ke-21 kartu biomarker', expect: { site: 'section' } },
        { g: 'view', en: 'Show digital twin', id: 'Tampilkan kembar digital', aen: 'The 3D eye digital twin', aid: 'Kembar digital mata 3D', expect: { fuzzy: 'show_data', section: 'twin' } },
        { g: 'view', en: 'Show recommendations', id: 'Tampilkan rekomendasi', aen: 'Mitigation protocols & countermeasures', aid: 'Protokol mitigasi & countermeasure', expect: { site: 'section' } },

        { g: 'rx', admin: true, en: 'Activate LBNP', id: 'Aktifkan LBNP', aen: 'Approves the Chibis LBNP protocol (-35 mmHg)', aid: 'Menyetujui protokol Chibis LBNP (-35 mmHg)', expect: { fuzzy: 'toggle_rx', rxKey: 'lbnp', on: true } },
        { g: 'rx', admin: true, en: 'Activate CO2 protocol', id: 'Aktifkan protokol CO2', aen: 'Approves the CO₂ protocol (CDRA scrubber & low sodium)', aid: 'Menyetujui protokol CO₂ (scrubber CDRA & rendah natrium)', expect: { fuzzy: 'toggle_rx', rxKey: 'env', on: true } },
        { g: 'rx', admin: true, en: 'Activate HRV protocol', id: 'Aktifkan protokol HRV', aen: 'Approves the HRV protocol (0.1 Hz vagal biofeedback)', aid: 'Menyetujui protokol HRV (biofeedback vagal 0,1 Hz)', expect: { fuzzy: 'toggle_rx', rxKey: 'bhp', on: true } },
        { g: 'rx', admin: true, en: 'Activate all protocols', id: 'Aktifkan semua protokol', aen: 'Approves LBNP, CO₂ and HRV at once', aid: 'Menyetujui LBNP, CO₂ dan HRV sekaligus', expect: { fuzzy: 'toggle_rx', rxKey: 'all', on: true } },
        { g: 'rx', admin: true, en: 'Deactivate all protocols', id: 'Matikan semua protokol', aen: 'Stops all intervention protocols', aid: 'Menghentikan semua protokol intervensi', expect: { fuzzy: 'toggle_rx', rxKey: 'all', on: false } },

        { g: 'ask', en: 'Explain my OCT data', id: 'Jelaskan data OCT saya', aen: 'HERO explains the 7 eye variables aloud', aid: 'HERO menjelaskan 7 variabel mata secara lisan', expect: { fuzzy: 'show_data', category: 'oct7' } },
        { g: 'ask', en: 'How is my mental health?', id: 'Bagaimana kondisi mental saya?', aen: 'HERO analyses the 7 mental health variables', aid: 'HERO menganalisis 7 variabel kesehatan mental', expect: { fuzzy: 'show_data', category: 'bhp7' } },
        { g: 'ask', en: 'Explain the cabin environment', id: 'Jelaskan lingkungan kabin', aen: 'HERO explains the 7 cabin environment variables', aid: 'HERO menjelaskan 7 variabel lingkungan kabin', expect: { fuzzy: 'show_data', category: 'env7' } },
        { g: 'ask', en: 'Explain my eye, mental and cabin data', id: 'Jelaskan data mata, mental, dan kabin saya', aen: 'HERO explains all 21 variables together', aid: 'HERO menjelaskan ke-21 variabel sekaligus', expect: { fuzzy: 'show_data', category: 'all' } },
        { g: 'ask', en: 'Am I ready for EVA?', id: 'Apakah saya siap EVA?', aen: 'HERO assesses spacewalk readiness', aid: 'HERO menilai kesiapan spacewalk', expect: { fuzzy: 'show_data' } },
        { g: 'ask', en: 'What do you recommend for me?', id: 'Apa rekomendasi untuk saya?', aen: 'HERO reads today\'s advice', aid: 'HERO membacakan saran hari ini', expect: { fuzzy: 'show_data', section: 'countermeasures' } },

        { g: 'sys', en: 'Switch to Indonesian', id: 'Ganti ke bahasa Inggris', aen: 'Changes the display & voice language', aid: 'Mengganti bahasa tampilan & suara', expect: { site: 'lang' } },
        { g: 'sys', en: 'Stop', id: 'Stop', aen: 'Interrupts HERO; then say "No, I mean …" to correct', aid: 'Memotong HERO; lanjutkan "Bukan, maksud saya …" untuk mengoreksi', expect: { bargeIn: true } },
        { g: 'sys', en: 'Minimize', id: 'Tutup', aen: 'Minimizes the assistant panel', aid: 'Mengecilkan panel asisten', expect: { minimize: true } },
        { g: 'sys', en: 'Turn off microphone', id: 'Matikan mikrofon', aen: 'Stops "Hi HERO" listening; tap the mic button to turn it back on', aid: 'Menghentikan pendengaran "Hai HERO"; tekan tombol mikrofon untuk menyalakan lagi', expect: { site: 'mic_off' } },
        { g: 'sys', en: 'Log out', id: 'Keluar akun', aen: 'Signs out of HERO', aid: 'Keluar dari HERO', expect: { site: 'logout' } }
    ];
    return list.filter((c) => isAdmin || !c.admin);
}

// Perintah pendek untuk mengecilkan panel (dipakai juga oleh asisten)
export const MINIMIZE_PATTERN = /^(minimize|sembunyi|standby|tutup|diam|cukup|selesai|close|hide|quiet)$/i;
