// y-indexeddb marks sideEffects:false in its package.json, which causes
// Rollup to tree-shake it away. We force-include it by re-exporting the class
// and using it in a way the minifier can't eliminate.
import { IndexeddbPersistence } from 'y-indexeddb';

// This forces the module into the bundle — Rollup sees the re-export as used
export { IndexeddbPersistence };

export function persistDoc(doc, groupId) {
  const persistence = new IndexeddbPersistence(`splitdumb-p2p-${groupId}`, doc);
  
  return new Promise((resolve) => {
    // If already synced, resolve immediately
    if (persistence.synced) {
      console.log(`IndexedDB already synced for group ${groupId}`);
      resolve();
      return;
    }
    
    // Wait for synced event, with timeout fallback
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        console.log(`IndexedDB ready for group ${groupId}`);
        resolve();
      }
    };
    
    persistence.on('synced', done);
    // Fallback: don't hang forever if synced event never fires
    setTimeout(done, 3000);
  });
}