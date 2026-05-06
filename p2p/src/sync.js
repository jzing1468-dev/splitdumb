import * as Y from 'yjs';
import { joinRoom } from 'trystero';

let currentRoom = null;

const RELAY_URLS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
];

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:staticauth.openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
    { urls: 'turn:staticauth.openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
    { urls: 'turns:staticauth.openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
  ],
};

export function joinGroup(doc, groupId, { onPeerJoin, onPeerLeave, onSynced }) {
  if (currentRoom) {
    currentRoom.leave();
  }

  console.log(`[SplitDumb] Joining room: ${groupId}`);
  const room = joinRoom({ appId: 'splitdumb-p2p', relayUrls: RELAY_URLS, rtcConfig: RTC_CONFIG }, groupId);
  const [sendUpdate, getUpdate] = room.makeAction('docUpdate');

  // Broadcast local changes to peers
  doc.on('update', (update, origin) => {
    if (origin === 'remote') return;
    console.log(`[SplitDumb] Sending update: ${update.byteLength} bytes`);
    sendUpdate(update);
  });

  // Receive remote changes
  getUpdate((update, peerId) => {
    console.log(`[SplitDumb] Received update: ${update.byteLength || update.length} bytes from ${peerId?.substring(0, 8)}...`);
    Y.applyUpdate(doc, new Uint8Array(update), 'remote');
  });

  // Peer events
  room.onPeerJoin((peerId) => {
    console.log(`[SplitDumb] Peer joined: ${peerId}`);
    const state = Y.encodeStateAsUpdate(doc);
    console.log(`[SplitDumb] Sending full state to new peer: ${state.byteLength} bytes`);
    sendUpdate(state);
    onPeerJoin?.(peerId);
  });

  room.onPeerLeave((peerId) => {
    console.log(`[SplitDumb] Peer left: ${peerId}`);
    onPeerLeave?.(peerId);
  });

  // Log current peers periodically
  const peerLogger = setInterval(() => {
    const peers = room.getPeers();
    console.log(`[SplitDumb] Current peers: ${Object.keys(peers).length}`, peers);
  }, 10000);

  currentRoom = room;

  if (onSynced) setTimeout(() => {
    console.log('[SplitDumb] Synced callback fired');
    onSynced();
  }, 500);

  return {
    leave: () => {
      clearInterval(peerLogger);
      room.leave();
      currentRoom = null;
    },
    getPeers: () => room.getPeers(),
    sendUpdate,
  };
}

export function leaveGroup() {
  if (currentRoom) {
    currentRoom.leave();
    currentRoom = null;
  }
}