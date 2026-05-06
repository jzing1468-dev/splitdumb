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
        // If we're joining an existing group (via URL), wait a bit for remote data
        // before showing the identity picker, so we can see existing members
        const params = new URLSearchParams(window.location.search);
        const isJoining = !!params.get('group');
        if (isJoining && !doc.getMap('members').size) {
          // No members yet — wait up to 8s for remote sync
          const timer = setTimeout(() => setShowIdentity(true), 8000);
          // Show early if members appear from remote sync
          const observer = () => {
            if (doc.getMap('members').size > 0) {
              clearTimeout(timer);
              doc.getMap('members').unobserve(observer);
              setShowIdentity(true);
            }
          };
          doc.getMap('members').observe(observer);
          return () => { clearTimeout(timer); doc.getMap('members').unobserve(observer); };
        } else {
          setShowIdentity(true);
        }
      }
    }
  }, [groupId, doc]);

  const handleJoinGroup = async (code) => {
    if (loading) return;
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
    setGroupId(code);
    window.history.replaceState({}, '', `?group=${code}`);
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
    setShowIdentity(true);
    window.history.replaceState({}, '', `?group=${id}`);
    setCreating(false);
  };

  const handleActorReady = (member) => {
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

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Joining group...</p>
      </div>
    );
  }

  // Landing page
  if (!doc) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
        <div className="hero">
          <span className="hero-icon">💸</span>
          <h1 className="hero-title">SplitDumb P2P</h1>
          <p className="hero-sub">Split expenses with friends — no server, no sign-up, no cost.</p>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">How it works</div>
          <ul style={{ fontSize: '0.88rem', color: 'var(--text-dim)', lineHeight: 1.7, paddingLeft: 18 }}>
            <li>Create a group, share the link — anyone can join</li>
            <li>Add expenses, split equally or by shares/exact/percentage</li>
            <li>See who owes what and settle up</li>
            <li>Data syncs peer-to-peer via WebRTC</li>
            <li>Saved locally in your browser (IndexedDB)</li>
          </ul>
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

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Or create a new group</div>
          <div className="form-group">
            <input className="form-input" placeholder="Group name (optional)" value={groupName}
              onChange={e => setGroupName(e.target.value)} maxLength={50} />
          </div>
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleCreateGroup} disabled={creating}>
            {creating ? 'Creating...' : 'Create Group'}
          </button>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Offline-first</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.65 }}>
            <p style={{ marginBottom: 8 }}><strong>At least one user must keep the page open</strong> for the group to stay alive and accept new peers. If everyone closes their browser, the group still exists in each user's local storage — but new visitors won't find any peers to sync with until someone opens the group again.</p>
            <p style={{ marginBottom: 8 }}><strong>Share the link</strong> — anyone with <code style={{ background: 'var(--surface3)', padding: '2px 6px', borderRadius: 4, fontSize: '0.82rem' }}>?group=CODE</code> can join.</p>
            <p><strong>Download the app</strong> — save the HTML file below and open it anytime. It works offline and keeps your data in browser storage.</p>
          </div>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => {
              const html = '<!DOCTYPE html>' + document.documentElement.outerHTML;
              const blob = new Blob([html], { type: 'text/html' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'splitdumb-p2p.html';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            ⬇ Download SplitDumb P2P
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Built with Yjs + Trystero (WebRTC) · <a href="https://github.com/jzing1468-dev/splitdumb" target="_blank" rel="noopener" style={{ color: 'var(--primary)' }}>Source on GitHub</a>
        </div>
      </div>
    );
  }

  // Waiting for remote sync (joining via URL, no members yet)
  if (doc && !showIdentity && !self && !memberList.length) {
    const groupName = doc.getMap('meta')?.get('name');
    return (
      <div className="loading">
        <div className="spinner" />
        <p>{groupName ? `Joining ${groupName}...` : `Connecting to group ${groupId}...`}</p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 8 }}>Waiting for peers to sync</p>
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