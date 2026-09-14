import React, { useState, useCallback } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MAX_CAPTION = 2200;

// ─── Drag-over hook ───────────────────────────────────────────────────────────
function useDragOver() {
  const [dragOver, setDragOver] = useState(false);
  const handlers = {
    onDragEnter: (e) => { e.preventDefault(); setDragOver(true); },
    onDragOver:  (e) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: (e) => { e.preventDefault(); setDragOver(false); },
    onDrop:      (e) => { e.preventDefault(); setDragOver(false); return e.dataTransfer.files[0] || null; },
  };
  return [dragOver, handlers];
}

export default function PublishForm({ onPublished }) {
  const [image,          setImage]          = useState(null);   // File
  const [preview,        setPreview]        = useState(null);   // data URL
  const [caption,        setCaption]        = useState('');
  const [productLink,    setProductLink]    = useState('');
  const [triggerKeyword, setTriggerKeyword] = useState('');
  const [loading,        setLoading]        = useState(false);
  const [status,         setStatus]         = useState(null);   // { type, message }

  const [dragOver, dragHandlers] = useDragOver();

  const handleFile = useCallback((file) => {
    if (!file) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
    setStatus(null);
  }, []);

  const onDrop = useCallback((e) => {
    const file = dragHandlers.onDrop(e);
    if (file) handleFile(file);
  }, [dragHandlers, handleFile]);

  const removeImage = () => {
    setImage(null);
    setPreview(null);
  };

  const captionLen = caption.length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image)          return setStatus({ type: 'error', message: 'Please select an image.' });
    if (!caption.trim()) return setStatus({ type: 'error', message: 'Caption cannot be empty.' });
    if (!productLink.trim()) return setStatus({ type: 'error', message: 'Product link is required.' });
    if (!triggerKeyword.trim()) return setStatus({ type: 'error', message: 'Trigger keyword is required.' });
    if (captionLen > MAX_CAPTION) return setStatus({ type: 'error', message: `Caption is too long (${captionLen}/${MAX_CAPTION}).` });

    setLoading(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('image',           image);
      formData.append('caption',         caption.trim());
      formData.append('product_link',    productLink.trim());
      formData.append('trigger_keyword', triggerKeyword.trim().toLowerCase());

      const res = await fetch(`${BACKEND}/api/publish`, {
        method: 'POST',
        body:   formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Publish failed');

      setStatus({ type: 'success', message: `✓ Published! Post ID: ${data.ig_media_id}` });
      setImage(null);
      setPreview(null);
      setCaption('');
      setProductLink('');
      setTriggerKeyword('');
      onPublished?.();
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">
        <span className="card-title-icon">📸</span>
        New Post
      </h2>

      <form onSubmit={handleSubmit} noValidate>
        {/* ── Image upload ── */}
        <div className="form-group">
          <label className="form-label">Image</label>

          {preview ? (
            <div className="image-preview-wrap">
              <img src={preview} alt="Preview" className="image-preview" />
              <div className="image-preview-overlay">
                <button type="button" className="image-remove-btn" onClick={removeImage}>
                  Remove Image
                </button>
              </div>
              <div className="image-filename">
                <span>📄</span>
                <span>{image?.name}</span>
                <span style={{ color: 'var(--text-400)', marginLeft: 'auto' }}>
                  {(image?.size / 1024).toFixed(0)} KB
                </span>
              </div>
            </div>
          ) : (
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              {...dragHandlers}
              onDrop={onDrop}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                id="image-input"
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <span className="drop-zone-icon">🖼️</span>
              <p className="drop-zone-label">Drag &amp; drop or click to upload</p>
              <p className="drop-zone-hint">JPEG, PNG, WEBP — up to 8 MB</p>
            </div>
          )}
        </div>

        {/* ── Caption ── */}
        <div className="form-group">
          <label className="form-label" htmlFor="caption-input">Caption</label>
          <textarea
            id="caption-input"
            className="form-textarea"
            placeholder="Write your Instagram caption…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={MAX_CAPTION + 50}
          />
          <div
            className={`char-count ${
              captionLen > MAX_CAPTION ? 'over' : captionLen > MAX_CAPTION * 0.9 ? 'warn' : ''
            }`}
          >
            {captionLen} / {MAX_CAPTION}
          </div>
        </div>

        {/* ── Product link + Trigger keyword (side-by-side) ── */}
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="product-link-input">Product Link</label>
            <input
              id="product-link-input"
              type="url"
              className="form-input"
              placeholder="https://amazon.in/…"
              value={productLink}
              onChange={(e) => setProductLink(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="trigger-keyword-input">Trigger Keyword</label>
            <input
              id="trigger-keyword-input"
              type="text"
              className="form-input"
              placeholder='e.g. "link"'
              value={triggerKeyword}
              onChange={(e) => setTriggerKeyword(e.target.value)}
            />
          </div>
        </div>

        {/* ── Submit ── */}
        <button
          type="submit"
          className="btn-publish"
          disabled={loading}
          id="publish-btn"
        >
          {loading ? (
            <>
              <span className="spinner" />
              Publishing…
            </>
          ) : (
            <>
              <span>🚀</span>
              Publish to Instagram
            </>
          )}
        </button>

        {/* ── Status banner ── */}
        {status && (
          <div className={`status-banner ${status.type}`}>
            <span className="status-icon">
              {status.type === 'success' ? '✅' : '❌'}
            </span>
            <span>{status.message}</span>
          </div>
        )}
      </form>
    </div>
  );
}
