import React, { useState, useEffect, useCallback } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

function truncate(str, max = 80) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function SkeletonCards() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
      ))}
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

export default function PostsList({ refreshKey, onCountChange, onDeleted }) {
  const [posts,      setPosts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [spinning,   setSpinning]   = useState(false);
  const [deletingId, setDeletingId] = useState(null); // currently being deleted

  // Modal State
  const [deletePromptPost, setDeletePromptPost] = useState(null);
  const [deleteOption,     setDeleteOption]     = useState('cloudinary_only'); // default

  const fetchPosts = useCallback(async (showSpinner = false) => {
    if (showSpinner) setSpinning(true);
    try {
      const res  = await fetch(`${BACKEND}/api/posts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load posts');
      const list = Array.isArray(data) ? data : [];
      setPosts(list);
      onCountChange?.(list.length);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }, [onCountChange]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { if (refreshKey > 0) fetchPosts(); }, [refreshKey, fetchPosts]);

  // Opens the custom modal
  const handleDeleteClick = (post) => {
    setDeletePromptPost(post);
    if (post.image_url === 'DELETED') {
      setDeleteOption('all');
    } else {
      setDeleteOption('cloudinary_only'); // Reset to default option
    }
  };

  // Executes the deletion based on the selected option
  const confirmDelete = async () => {
    const post = deletePromptPost;
    const mode = deleteOption;
    
    // Close modal immediately
    setDeletePromptPost(null);
    setDeletingId(post.ig_media_id);

    try {
      const res  = await fetch(`${BACKEND}/api/posts/${post.ig_media_id}?mode=${mode}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      if (mode === 'all') {
        // Remove from local state immediately
        setPosts(prev => {
          const updated = prev.filter(p => p.ig_media_id !== post.ig_media_id);
          onCountChange?.(updated.length);
          return updated;
        });
        onDeleted?.();
      } else {
        // Update local state to mark as DELETED
        setPosts(prev => prev.map(p => 
          p.ig_media_id === post.ig_media_id ? { ...p, image_url: 'DELETED' } : p
        ));
        alert('Media successfully deleted from Cloudinary to free up space! The automation is still running.');
      }
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const isCloudinaryDeleted = deletePromptPost?.image_url === 'DELETED';

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon">📋</div>
        <div>
          <h2>Published Posts</h2>
          <p>{posts.length} post{posts.length !== 1 ? 's' : ''} tracked for automation</p>
        </div>
        <button
          className="btn btn-secondary"
          style={{ marginLeft: 'auto', padding: '7px 14px', fontSize: '0.8rem' }}
          onClick={() => fetchPosts(true)}
          disabled={spinning}
          id="refresh-posts-btn"
          title="Refresh posts"
        >
          {spinning ? <span className="spinner" style={{ borderTopColor: 'var(--text-mid)' }} /> : <RefreshIcon />}
          Refresh
        </button>
      </div>

      <div className="card-body">
        {loading && <SkeletonCards />}

        {!loading && error && (
          <div className="toast toast-error">
            <span className="toast-icon">❌</span><span>{error}</span>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">🌱</span>
            <div className="empty-title">No posts yet</div>
            <div className="empty-desc">Publish your first post to start automation!</div>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <div className="posts-list">
            {posts.map((post, i) => {
              const isDeleting = deletingId === post.ig_media_id;
              return (
                <div
                  className="post-item"
                  key={post.ig_media_id || i}
                  id={`post-${post.ig_media_id || i}`}
                  style={{ opacity: isDeleting ? 0.4 : 1, transition: 'opacity .3s' }}
                >
                  {post.image_url && post.image_url !== 'DELETED' ? (
                    <img src={post.image_url} alt="Post thumbnail" className="post-thumb"
                      loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div className="post-thumb-placeholder" style={{ background: '#f1f5f9', color: '#94a3b8' }}>
                      <div style={{ fontSize: '0.7rem', textAlign: 'center', padding: '2px' }}>Media<br/>Deleted</div>
                    </div>
                  )}

                  <div className="post-info">
                    <div className="post-caption" title={post.caption}>
                      {truncate(post.caption, 90)}
                    </div>
                    <div className="post-meta">
                      {post.trigger_keyword && (
                        <span className="post-tag post-tag-keyword">🔑 {post.trigger_keyword}</span>
                      )}
                      {post.product_link && (
                        <a className="post-tag post-tag-link" href={post.product_link}
                          target="_blank" rel="noopener noreferrer" title={post.product_link}
                          onClick={(e) => e.stopPropagation()}>
                          🔗 {truncate(post.product_link.replace(/^https?:\/\//, ''), 28)}
                        </a>
                      )}
                    </div>
                    {post.created_at && <div className="post-date">🕐 {formatDate(post.created_at)}</div>}
                  </div>

                  {/* ── Delete button ── */}
                  <button
                    className="btn"
                    id={`delete-post-${post.ig_media_id || i}`}
                    title="Delete post"
                    disabled={isDeleting}
                    onClick={() => handleDeleteClick(post)}
                    style={{
                      flexShrink: 0,
                      padding: '7px 10px',
                      background: isDeleting ? '#fee2e2' : '#fff',
                      border: '1.5px solid #fca5a5',
                      color: '#dc2626',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      transition: 'all .2s',
                    }}
                    onMouseEnter={e => !isDeleting && (e.currentTarget.style.background = '#fee2e2')}
                    onMouseLeave={e => !isDeleting && (e.currentTarget.style.background = '#fff')}
                  >
                    {isDeleting
                      ? <span className="spinner" style={{ borderTopColor: '#dc2626', width: 12, height: 12 }} />
                      : <TrashIcon />}
                    {isDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Custom Delete Modal ── */}
      {deletePromptPost && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: 'white', padding: '24px', borderRadius: '14px',
            width: '90%', maxWidth: '480px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.3rem', color: '#111' }}>Delete Options</h3>
            <p style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#555', lineHeight: '1.5' }}>
              Choose how you want to delete the post: <br/><strong>"{truncate(deletePromptPost.caption, 40)}"</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <label style={{ 
                display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', 
                border: deleteOption === 'cloudinary_only' ? '2px solid #3b82f6' : '1px solid #ddd', 
                borderRadius: '10px', 
                background: isCloudinaryDeleted ? '#f1f5f9' : (deleteOption === 'cloudinary_only' ? '#eff6ff' : '#fff'),
                opacity: isCloudinaryDeleted ? 0.6 : 1,
                cursor: isCloudinaryDeleted ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}>
                <input type="radio" name="deleteMode" value="cloudinary_only"
                  checked={deleteOption === 'cloudinary_only'}
                  disabled={isCloudinaryDeleted}
                  onChange={() => setDeleteOption('cloudinary_only')}
                  style={{ marginTop: '4px', transform: 'scale(1.2)' }} />
                <div>
                  <div style={{ fontWeight: '700', color: isCloudinaryDeleted ? '#64748b' : '#1e3a8a', fontSize: '0.95rem', textDecoration: isCloudinaryDeleted ? 'line-through' : 'none' }}>
                    {isCloudinaryDeleted ? 'Already Deleted from Cloudinary' : 'Delete from Cloudinary ONLY'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px', lineHeight: '1.4' }}>
                    {isCloudinaryDeleted 
                      ? "This media has already been removed to save storage space." 
                      : "Frees up Cloudinary storage. The post stays LIVE on Instagram and the automated DMs will keep working."}
                  </div>
                </div>
              </label>

              <label style={{ 
                display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', padding: '14px', 
                border: deleteOption === 'all' ? '2px solid #ef4444' : '1px solid #ddd', 
                borderRadius: '10px', background: deleteOption === 'all' ? '#fef2f2' : '#fff',
                transition: 'all 0.2s'
              }}>
                <input type="radio" name="deleteMode" value="all"
                  checked={deleteOption === 'all'}
                  onChange={() => setDeleteOption('all')}
                  style={{ marginTop: '4px', transform: 'scale(1.2)' }} />
                <div>
                  <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '0.95rem' }}>Delete EVERYWHERE</div>
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px', lineHeight: '1.4' }}>
                    Permanently removes the post from Instagram, Cloudinary, and Google Sheets. This will STOP automation.
                  </div>
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setDeletePromptPost(null)}
                style={{ padding: '10px 20px', fontWeight: 'bold' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={confirmDelete}
                style={{ 
                  padding: '10px 20px', fontWeight: 'bold',
                  background: deleteOption === 'all' ? '#dc2626' : 'var(--primary)', 
                  borderColor: deleteOption === 'all' ? '#dc2626' : 'var(--primary)' 
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
