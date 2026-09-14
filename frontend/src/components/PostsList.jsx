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
    <div className="posts-loading">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

// ─── Refresh icon SVG ─────────────────────────────────────────────────────────
function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export default function PostsList({ refreshKey }) {
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
      setPosts(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Re-fetch when a new post is published (parent increments refreshKey)
  useEffect(() => {
    if (refreshKey > 0) fetchPosts();
  }, [refreshKey, fetchPosts]);

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <span>📋</span>
          Published Posts
          {!loading && (
            <span className="section-count">{posts.length}</span>
          )}
        </h2>
        <button
          className={`refresh-btn ${spinning ? 'spinning' : ''}`}
          onClick={() => fetchPosts(true)}
          disabled={spinning}
          id="refresh-posts-btn"
          title="Refresh posts"
        >
          <RefreshIcon />
          Refresh
        </button>
      </div>

      {loading && <SkeletonCards />}

      {!loading && error && (
        <div className="status-banner error" style={{ margin: 0 }}>
          <span className="status-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="posts-empty">
          <span className="posts-empty-icon">🌱</span>
          <p className="posts-empty-text">No posts yet — publish your first one!</p>
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="posts-list">
          {posts.map((post, i) => (
            <div className="post-card" key={post.ig_media_id || i} id={`post-${post.ig_media_id || i}`}>
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
              <div className="post-body">
                <div className="post-caption" title={post.caption}>
                  {truncate(post.caption, 90)}
                </div>
                <div className="post-meta">
                  {post.trigger_keyword && (
                    <span className="post-tag keyword" title="Trigger keyword">
                      🔑 {post.trigger_keyword}
                    </span>
                  )}
                  {post.product_link && (
                    <a
                      className="post-tag link"
                      href={post.product_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={post.product_link}
                      onClick={(e) => e.stopPropagation()}
                    >
                      🔗 {truncate(post.product_link.replace(/^https?:\/\//, ''), 30)}
                    </a>
                  )}
                  {post.created_at && (
                    <span className="post-tag date">
                      🕐 {formatDate(post.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
