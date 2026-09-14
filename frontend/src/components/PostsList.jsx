import React, { useState, useEffect, useCallback } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export default function PostsList({ refreshKey, onCountChange }) {
  const [posts,    setPosts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [spinning, setSpinning] = useState(false);

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
          {spinning
            ? <span className="spinner" style={{ borderTopColor: 'var(--text-mid)' }} />
            : <RefreshIcon />}
          Refresh
        </button>
      </div>

      <div className="card-body">
        {loading && <SkeletonCards />}

        {!loading && error && (
          <div className="toast toast-error">
            <span className="toast-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">🌱</span>
            <div className="empty-title">No posts yet</div>
            <div className="empty-desc">Publish your first post to start the automation!</div>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <div className="posts-list">
            {posts.map((post, i) => (
              <div className="post-item" key={post.ig_media_id || i} id={`post-${post.ig_media_id || i}`}>
                {post.image_url ? (
                  <img
                    src={post.image_url}
                    alt="Post thumbnail"
                    className="post-thumb"
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
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
                      <a
                        className="post-tag post-tag-link"
                        href={post.product_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={post.product_link}
                        onClick={(e) => e.stopPropagation()}
                      >
                        🔗 {truncate(post.product_link.replace(/^https?:\/\//, ''), 28)}
                      </a>
                    )}
                  </div>
                  {post.created_at && (
                    <div className="post-date">🕐 {formatDate(post.created_at)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
