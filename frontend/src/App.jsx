import React, { useState } from 'react';
import PublishForm from './components/PublishForm.jsx';
import PostsList   from './components/PostsList.jsx';

export default function App() {
  // Incremented after a successful publish to trigger PostsList refresh
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="app-wrapper">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo" aria-hidden="true">⚡</div>
          <div>
            <div className="header-title">InstaFlow</div>
            <div className="header-subtitle">Instagram Automation Dashboard</div>
          </div>
        </div>
        <div className="header-badge" aria-label="System active">
          <span className="header-badge-dot" />
          Automation Active
        </div>
      </header>

      {/* ── Main content ── */}
      <main>
        <div className="main-grid">
          {/* Left — publish form */}
          <section aria-label="Publish new post">
            <PublishForm onPublished={() => setRefreshKey((k) => k + 1)} />
          </section>

          {/* Right — posts list */}
          <section aria-label="Published posts">
            <PostsList refreshKey={refreshKey} />
          </section>
        </div>
      </main>
    </div>
  );
}
