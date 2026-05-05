// y-indexeddb marks sideEffects:false in its package.json, which causes
// Rollup to tree-shake it away. We force-include it by re-exporting the class
// and using it in a way the minifier can't eliminate.
import { IndexeddbPersistence } from 'y-indexeddb';

// This forces the module into the bundle — Rollup sees the re-export as used
export { IndexeddbPersistence };

export function persistDoc(doc, groupId) {
  const persistence = new IndexeddbPersistence(`splitdumb-p2p-${groupId}`, doc);
  
  return new Promise((resolve) => {
    persistence.on('synced', () => {
      console.log(`IndexedDB synced for group ${groupId}`);
      resolve();
    });
  });
}