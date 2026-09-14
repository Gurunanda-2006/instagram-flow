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

  const handleDelete = async (post) => {
    if (!window.confirm(`Delete post "${truncate(post.caption, 40)}"?\n\nThis will remove it from:\n• Instagram\n• Cloudinary (image)\n• Google Sheet`)) return;

    setDeletingId(post.ig_media_id);
    try {
      const res  = await fetch(`${BACKEND}/api/posts/${post.ig_media_id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');

      // Remove from local state immediately
      setPosts(prev => {
        const updated = prev.filter(p => p.ig_media_id !== post.ig_media_id);
        onCountChange?.(updated.length);
        return updated;
      });
      onDeleted?.();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

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
                  {post.image_url ? (
                    <img src={post.image_url} alt="Post thumbnail" className="post-thumb"
                      loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div className="post-thumb-placeholder">🖼️</div>
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
                    onClick={() => handleDelete(post)}
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
    </div>
  );
}
