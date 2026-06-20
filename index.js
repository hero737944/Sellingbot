const http = require('http');
const { initDB } = require('./database');

async function main() {
  console.log('🚀 Initializing database...');
  await initDB();

  console.log('🤖 Starting User Bot...');
  require('./userBot');

  console.log('👑 Starting Admin Bot...');
  require('./adminBot');

  console.log('✅ Both bots are running!');

  // Dummy HTTP server so Render Web Service health check passes
  const PORT = process.env.PORT || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Zed Zoee Bot is running ✅');
  }).listen(PORT, () => {
    console.log(`🌐 Dummy server listening on port ${PORT} (for Render health check)`);
  });
}

main().catch(err => {
  console.error('Fatal error starting bots:', err);
  process.exit(1);
});
