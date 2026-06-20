const { initDB } = require('./database');

async function main() {
  console.log('🚀 Initializing database...');
  await initDB();

  console.log('🤖 Starting User Bot...');
  require('./userBot');

  console.log('👑 Starting Admin Bot...');
  require('./adminBot');

  console.log('✅ Both bots are running!');
}

main().catch(err => {
  console.error('Fatal error starting bots:', err);
  process.exit(1);
});
