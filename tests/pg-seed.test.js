// Skenario tests/seed.test.js dijalankan ulang dalam mode Postgres (database tiruan, lihat tests/fake-pg.js)
process.env.HERO_TEST_PG = '1';
await import('./seed.test.js');
