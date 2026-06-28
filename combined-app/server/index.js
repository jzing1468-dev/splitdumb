// Combined backend: PokerWise + SplitDumb on one Express server
// Both original servers export { app, start } and do NOT auto-listen when required.

const express = require('express');

const POKERWISE_DIR = '/home/jzing/Projects/pokerwise';
const SPLITDUMB_DIR = '/home/jzing/Projects/splitdumb';

const PORT = process.env.PORT || 3000;

async function main() {
  // Set SplitDumb auth env vars before requiring its server (auth.js needs them at require time)
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'shared-auth-secret-prod-2026';
  process.env.AUTH_SERVICE = process.env.AUTH_SERVICE || 'https://auth.johnzhong.win';
  process.env.COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '.johnzhong.win';

  // Require both servers — they export { app, start } and do NOT auto-listen
  const pokerWise = require(POKERWISE_DIR + '/server/index.js');
  const splitDumb = require(SPLITDUMB_DIR + '/server/index.js');

  // Initialize both databases (normally done inside start(), which we skip)
  const pokerDb = require(POKERWISE_DIR + '/server/db');
  await pokerDb.init();

  const splitDb = require(SPLITDUMB_DIR + '/server/db');
  await splitDb.init();

  // Mount sub-apps under their base paths
  // Each sub-app's routes already include /api/v1/... prefixes
  const app = express();
  app.use('/pokerwise', pokerWise.app);
  app.use('/splitdumb', splitDumb.app);

  app.listen(PORT, () => {
    console.log(`Combined backend running on port ${PORT}`);
    console.log(`  PokerWise: /pokerwise/api/v1/*`);
    console.log(`  SplitDumb: /splitdumb/api/v1/*`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});