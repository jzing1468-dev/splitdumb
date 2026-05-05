import { useState, useEffect } from 'react';
import { api, API_BASE } from '../api';

function AttachmentManager({ code, expenseId }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!expenseId) return;
    api.getAttachments(code, expenseId)
      .then(setAttachments)
      .catch(() => {});
  }, [code, expenseId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await api.uploadAttachment(code, expenseId, file);
      setAttachments(prev => [...prev, att]);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteAttachment(id);
      setAttachments(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div>
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {attachments.map(att => (
            <div key={att.id} style={{ position: 'relative', width: 72, height: 72 }}>
              {att.mimetype.startsWith('image/') ? (
                <img
                  src={API_BASE + '/attachments/' + att.id + '/file'}
                  alt={att.filename}
                  style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              ) : (
                <div style={{
                  width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                  fontSize: '1.5rem', color: 'var(--text-muted)',
                }}>
                  📄
                </div>
              )}
              <button
                type="button"
                onClick={() => handleDelete(att.id)}
                style={{
                  position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--red)', color: '#fff', border: 'none', fontSize: '0.65rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="Remove"
              >
                ✕
              </button>
              <div style={{ fontSize: '0.55rem', textAlign: 'center', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {att.filename}
              </div>
            </div>
          ))}
        </div>
      )}
      <label style={{ cursor: 'pointer', display: 'inline-block' }}>
        <span className="btn btn-ghost btn-xs">{uploading ? 'Uploading...' : '+ Attach receipt'}</span>
        <input type="file" accept="image/*,.pdf" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
      </label>
    </div>
  );
}

export default AttachmentManager;