import React, { useState, useCallback } from 'react';

const BACKEND     = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MAX_CAPTION = 2200;

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
  const [isReel,         setIsReel]         = useState(false);
  const [media,          setMedia]          = useState(null);
  const [preview,        setPreview]        = useState(null);
  const [caption,        setCaption]        = useState('');
  const [productLink,    setProductLink]    = useState('');
  const [triggerKeyword, setTriggerKeyword] = useState('');
  const [loading,        setLoading]        = useState(false);
  const [status,         setStatus]         = useState(null);

  const [dragOver, dragHandlers] = useDragOver();

  const handleFile = useCallback((file) => {
    if (!file) return;
    setMedia(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
    setStatus(null);
  }, []);

  const onDrop = useCallback((e) => {
    const file = dragHandlers.onDrop(e);
    if (file) handleFile(file);
  }, [dragHandlers, handleFile]);

  const removeMedia = () => { setMedia(null); setPreview(null); };

  const captionLen = caption.length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!media)                 return setStatus({ type: 'error', message: 'Please select a media file.' });
    if (!caption.trim())        return setStatus({ type: 'error', message: 'Caption cannot be empty.' });
    if (!productLink.trim())    return setStatus({ type: 'error', message: 'Product link is required.' });
    if (!triggerKeyword.trim()) return setStatus({ type: 'error', message: 'Trigger keyword is required.' });
    if (captionLen > MAX_CAPTION) return setStatus({ type: 'error', message: `Caption too long (${captionLen}/${MAX_CAPTION}).` });

    setLoading(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('media',           media);
      formData.append('is_reel',         isReel);
      formData.append('caption',         caption.trim());
      formData.append('product_link',    productLink.trim());
      formData.append('trigger_keyword', triggerKeyword.trim().toLowerCase());

      const res  = await fetch(`${BACKEND}/api/publish`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Publish failed');

      setStatus({ type: 'success', message: `✓ Published! Post ID: ${data.ig_media_id}` });
      setMedia(null); setPreview(null); setCaption(''); setProductLink(''); setTriggerKeyword('');
      onPublished?.();
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon">{isReel ? '📱' : '📸'}</div>
        <div>
          <h2>Publish New {isReel ? 'Reel' : 'Post'}</h2>
          <p>Upload a {isReel ? 'video' : 'photo'} and configure automation</p>
        </div>
      </div>

      <div className="card-body">
        {status && (
          <div className={`toast ${status.type === 'success' ? 'toast-success' : 'toast-error'}`}>
            <span className="toast-icon">{status.type === 'success' ? '✅' : '❌'}</span>
            <span>{status.message}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', background: '#f5f5f5', padding: '4px', borderRadius: '8px' }}>
          <button 
            type="button" 
            style={{ flex: 1, padding: '8px', border: 'none', background: !isReel ? 'white' : 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: !isReel ? 'bold' : 'normal', boxShadow: !isReel ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            onClick={() => setIsReel(false)}
          >
            📸 Image Post
          </button>
          <button 
            type="button" 
            style={{ flex: 1, padding: '8px', border: 'none', background: isReel ? 'white' : 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: isReel ? 'bold' : 'normal', boxShadow: isReel ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            onClick={() => setIsReel(true)}
          >
            📱 Instagram Reel
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>

          {/* Media upload */}
          <div className="form-group">
            <label className="form-label">{isReel ? 'Video (9:16)' : 'Image'} <span>*</span></label>
            {preview ? (
              <div>
                {isReel ? (
                   <video src={preview} controls className="upload-preview" style={{maxHeight: 300, background: '#000'}} />
                ) : (
                   <img src={preview} alt="Preview" className="upload-preview" />
                )}
                <button type="button" className="btn btn-secondary"
                  onClick={removeMedia} style={{ marginTop: 8, width: '100%' }}>
                  ✕ Remove {isReel ? 'Video' : 'Image'}
                </button>
                <div className="form-hint">📄 {media?.name} · {(media?.size / 1024).toFixed(0)} KB</div>
              </div>
            ) : (
              <div className={`upload-zone ${dragOver ? 'dragover' : ''}`} {...dragHandlers} onDrop={onDrop}>
                <input type="file" accept={isReel ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp"} id="image-input"
                  onChange={(e) => handleFile(e.target.files[0])} />
                <span className="upload-icon">{isReel ? '🎬' : '🖼️'}</span>
                <div className="upload-text">Drag & drop or click to upload</div>
                <div className="upload-subtext">{isReel ? 'MP4, MOV (9:16 ratio) — up to 100 MB' : 'JPEG, PNG, WEBP — up to 8 MB'}</div>
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="form-group">
            <label className="form-label" htmlFor="caption-input">Caption <span>*</span></label>
            <textarea id="caption-input" className="form-textarea"
              placeholder="Write your Instagram caption…"
              value={caption} onChange={(e) => setCaption(e.target.value)}
              maxLength={MAX_CAPTION + 50} />
            <div className="form-hint" style={{ color: captionLen > MAX_CAPTION ? 'var(--red)' : undefined }}>
              {captionLen} / {MAX_CAPTION} characters
            </div>
          </div>

          {/* Product link */}
          <div className="form-group">
            <label className="form-label" htmlFor="product-link-input">Product Link <span>*</span></label>
            <input id="product-link-input" type="url" className="form-input"
              placeholder="https://amazon.in/…"
              value={productLink} onChange={(e) => setProductLink(e.target.value)} />
            <div className="form-hint">Users who comment the trigger word receive this link via DM</div>
          </div>

          {/* Trigger keyword */}
          <div className="form-group">
            <label className="form-label" htmlFor="trigger-keyword-input">Trigger Keyword <span>*</span></label>
            <input id="trigger-keyword-input" type="text" className="form-input"
              placeholder='e.g. "link" or "product"'
              value={triggerKeyword} onChange={(e) => setTriggerKeyword(e.target.value)} />
            <div className="form-hint">Case-insensitive — "LINK", "Link", "link" all match ✓</div>
          </div>

          {/* Submit */}
          <button type="submit" className="btn btn-primary" disabled={loading} id="publish-btn">
            {loading ? <><span className="spinner" />Publishing…</> : <>🚀 Publish to Instagram</>}
          </button>

        </form>
      </div>
    </div>
  );
}
