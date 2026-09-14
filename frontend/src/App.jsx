import React, { useState } from 'react';
import PublishForm from './components/PublishForm.jsx';
import PostsList   from './components/PostsList.jsx';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [postCount, setPostCount]   = useState(0);

  return (
    <div className="app-wrapper">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <img
            src="/logo.png"
            alt="ASG Servizi Logo"
            className="header-logo-img"
          />
          <div>
            <div className="header-title">ASG Servizi</div>
            <div className="header-subtitle">Instagram Automation Dashboard</div>
          </div>
        </div>
        <div className="header-badge" aria-label="System active">
          <span className="header-badge-dot" />
          Automation Active
        </div>
      </header>

      {/* ── Hero Banner ── */}
      <div className="hero-banner">
        <img
          src="/car-hero.png"
          alt="ASG Servizi Premium"
          className="hero-banner-img"
        />
        <div className="hero-banner-overlay">
          <div className="hero-text">
            <h1>Publish & <span>Automate</span></h1>
            <p>
              Post to Instagram and automatically send product links to anyone
              who comments your trigger keyword.
            </p>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main>
        {/* Stats Row */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Posts Tracked</div>
            <div className="stat-value red" id="stat-posts">{postCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">DM Trigger</div>
            <div className="stat-value" style={{ fontSize: '1.1rem', marginTop: '8px' }}>Keyword Comment</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Poll Interval</div>
            <div className="stat-value" style={{ fontSize: '1.1rem', marginTop: '8px' }}>60 sec</div>
          </div>
        </div>

        <div className="main-grid">
          {/* Left — publish form */}
          <section aria-label="Publish new post">
            <PublishForm onPublished={() => {
              setRefreshKey((k) => k + 1);
            }} />
          </section>

          {/* Right — posts list */}
          <section aria-label="Published posts">
            <PostsList
              refreshKey={refreshKey}
              onCountChange={setPostCount}
            />
          </section>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer">
        © 2026 <strong>ASG Servizi</strong> · Instagram Automation · All rights reserved
      </footer>

    </div>
  );
}
