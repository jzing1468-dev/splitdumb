import { useState, useEffect } from 'react';
import { createDoc, getGroupMeta, getMembers, addMember as addMemberToDoc } from './model';
import { joinGroup, leaveGroup } from './sync';
import { persistDoc } from './persistence';
import { IdentityPicker } from '@splitdumb/ui';
import GroupView from './pages/GroupView';

const ACTORS_KEY = 'splitdumb-p2p-actors';

function getSavedSelf(groupId) {
  const map = JSON.parse(localStorage.getItem(ACTORS_KEY) || '{}');
  return map[groupId] || null;
}

function saveSelf(groupId, member) {
  const map = JSON.parse(localStorage.getItem(ACTORS_KEY) || '{}');
  map[groupId] = member;
  localStorage.setItem(ACTORS_KEY, JSON.stringify(map));
}

function generateGroupId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function App() {
  const [groupId, setGroupId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('group') || '';
  });
  const [groupName, setGroupName] = useState('');
  const [doc, setDoc] = useState(null);
  const [sync, setSync] = useState(null);
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [self, setSelfState] = useState(null);
  const [showIdentity, setShowIdentity] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  // URL param handling — join group from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlGroup = params.get('group');
    if (urlGroup && !doc) {
      setGroupId(urlGroup);
      handleJoinGroup(urlGroup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for existing self when group and doc are ready
  useEffect(() => {
    if (groupId && doc) {
      const saved = getSavedSelf(groupId);
      if (saved) {
        setSelfState(saved);
        setShowIdentity(false);
      } else {
        setShowIdentity(true);
      }
    }
  }, [groupId, doc]);

  const handleJoinGroup = async (code) => {
    if (loading) return; // prevent double-join
    setLoading(true);
    const newDoc = createDoc();
    const room = joinGroup(newDoc, code, {
      onPeerJoin: () => setPeerCount(prev => prev + 1),
      onPeerLeave: () => setPeerCount(prev => Math.max(0, prev - 1)),
      onSynced: () => setConnected(true),
    });
    await persistDoc(newDoc, code);
    setDoc(newDoc);
    setSync(room);
    setLoading(false);
  };

  const handleCreateGroup = async () => {
    setCreating(true);
    const id = generateGroupId();
    const newDoc = createDoc();
    getGroupMeta(newDoc).set('name', groupName.trim() || `Group ${id}`);
    getGroupMeta(newDoc).set('createdAt', new Date().toISOString());

    const room = joinGroup(newDoc, id, {
      onPeerJoin: () => setPeerCount(prev => prev + 1),
      onPeerLeave: () => setPeerCount(prev => Math.max(0, prev - 1)),
      onSynced: () => setConnected(true),
    });
    await persistDoc(newDoc, id);
    setDoc(newDoc);
    setSync(room);
    setGroupId(id);
    // For create, auto-identify — show picker next
    setShowIdentity(true);
    window.history.replaceState({}, '', `?group=${id}`);
    setCreating(false);
  };

  const handleActorReady = (member) => {
    // Normalize to plain object
    const plain = { id: member.id, name: member.name, color: member.color };
    setSelfState(plain);
    saveSelf(groupId, plain);
    setShowIdentity(false);
  };

  const handleAddMember = async (name) => {
    const id = addMemberToDoc(doc, name);
    return doc.getMap('members').get(id);
  };

  const handleLeave = () => {
    if (sync) sync.leave();
    setDoc(null);
    setSync(null);
    setGroupId('');
    setSelfState(null);
    setConnected(false);
    setPeerCount(0);
    setShowIdentity(false);
    setLoading(false);
    window.history.replaceState({}, '', window.location.pathname);
  };

  // Convert Yjs members to plain array for IdentityPicker
  const memberList = (() => {
    if (!doc) return [];
    const list = [];
    doc.getMap('members').forEach((val) => {
      if (val.active !== false) list.push(val);
    });
    return list;
  })();

  // Loading state
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Joining group...</p>
      </div>
    );
  }

  // Landing page — no group yet
  if (!doc) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: 8 }}>💸</span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>SplitDumb P2P</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>No server needed. Share a link, split expenses.</p>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Join a group</div>
          <div className="form-group">
            <input className="form-input" placeholder="Enter group code" value={groupId}
              onChange={e => setGroupId(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && groupId.trim() && handleJoinGroup(groupId.trim())}
              maxLength={6} style={{ fontSize: '1.2rem', textAlign: 'center', letterSpacing: '0.15em' }} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={!groupId.trim()} onClick={() => handleJoinGroup(groupId.trim())}>
            Join Group
          </button>
        </div>

        <div className="card">
          <div className="card-title">Or create a new group</div>
          <div className="form-group">
            <input className="form-input" placeholder="Group name (optional)" value={groupName}
              onChange={e => setGroupName(e.target.value)} maxLength={50} />
          </div>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleCreateGroup} disabled={creating}>
            {creating ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    );
  }

  // Identity picker
  if (showIdentity || !self) {
    return (
      <IdentityPicker
        members={memberList}
        title={doc.getMap('meta')?.get('name') || `Group ${groupId}`}
        onReady={handleActorReady}
        onAddMember={handleAddMember}
      />
    );
  }

  // Main group view
  return (
    <GroupView
      doc={doc}
      groupId={groupId}
      self={self}
      connected={connected}
      peerCount={peerCount}
      onLeave={handleLeave}
      onSwitchIdentity={() => { setSelfState(null); setShowIdentity(true); }}
      onActorReady={handleActorReady}
    />
  );
}

export default App;