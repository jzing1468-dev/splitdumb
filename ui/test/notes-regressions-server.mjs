// Run from the repository: node ui/test/notes-regressions-server.mjs
// Serves only an isolated component harness; adapters never make API requests.
import { createServer } from '../../client/node_modules/vite/dist/node/index.js';
import react from '../../client/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  resolve: { alias: {
    'react-dom': `${root}/client/node_modules/react-dom`,
    react: `${root}/client/node_modules/react`,
  } },
  server: { host: '127.0.0.1', port: 5194, strictPort: true },
});
await server.listen();
console.log('Notes regression harness: http://127.0.0.1:5194/ui/test/notes-regressions.html');
