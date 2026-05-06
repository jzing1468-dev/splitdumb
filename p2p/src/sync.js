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

  const room = joinRoom({ appId: 'splitdumb-p2p', relayUrls: RELAY_URLS, rtcConfig: RTC_CONFIG }, groupId);
  const [sendUpdate, getUpdate] = room.makeAction('docUpdate');

  // Broadcast local changes to peers
  doc.on('update', (update, origin) => {
    // Don't re-broadcast updates that came from remote peers
    if (origin === 'remote') return;
    sendUpdate(update);
  });

  // Receive remote changes
  getUpdate((update) => {
    Y.applyUpdate(doc, new Uint8Array(update), 'remote');
  });

  // Peer events
  room.onPeerJoin((peerId) => {
    console.log(`Peer joined: ${peerId}`);
    // Send full doc state to new peer so they can sync
    sendUpdate(Y.encodeStateAsUpdate(doc));
    onPeerJoin?.(peerId);
  });

  room.onPeerLeave((peerId) => {
    console.log(`Peer left: ${peerId}`);
    onPeerLeave?.(peerId);
  });

  currentRoom = room;

  // Mark as synced after a short delay (Trystero doesn't have an explicit sync event)
  if (onSynced) setTimeout(() => onSynced(), 500);

  return {
    leave: () => {
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