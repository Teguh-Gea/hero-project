// Skenario tests/cabin-leader.test.js dijalankan ulang dalam mode Postgres (database tiruan, lihat tests/fake-pg.js)
process.env.HERO_TEST_PG = '1';
await import('./cabin-leader.test.js');
