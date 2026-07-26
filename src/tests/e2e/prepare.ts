import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { seedE2EDatabase } from '../../../prisma/seed-e2e';

async function prepareE2E() {
  const prismaCli = path.resolve('node_modules/prisma/build/index.js');
  execFileSync(
    process.execPath,
    [
      prismaCli,
      'db',
      'push',
      '--force-reset',
      '--skip-generate',
      '--accept-data-loss',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: 'file:./e2e.db',
        RUST_BACKTRACE: '1',
        RUST_LOG: 'info',
      },
      stdio: 'inherit',
    },
  );

  await seedE2EDatabase();
}

prepareE2E().catch((error) => {
  console.error('E2E veritabanı hazırlanamadı:', error);
  process.exitCode = 1;
});
