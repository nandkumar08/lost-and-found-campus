import React, { useRef, useState } from 'react';
import { Button } from './ui';

/**
 * Accessible multi-file image picker with instant previews.
 * Client-side checks are a convenience; the backend re-validates every byte.
 */
export function ImageUploader({
  files,
  onChange,
  max = 5,
  maxMb = 5,
  accept = 'image/jpeg,image/png,image/webp',
  label = 'Click to upload photographs',
  hint = 'JPG, PNG or WEBP up to 5 MB each'
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (incoming) => {
    const list = Array.from(incoming || []);
    if (!list.length) return;
    const accepted = [];
    for (const file of list) {
      if (!file.type.startsWith('image/')) {
        setError(`"${file.name}" is not an image file.`);
        continue;
      }
      if (file.size > maxMb * 1024 * 1024) {
        setError(`"${file.name}" exceeds the ${maxMb} MB limit.`);
        continue;
      }
      accepted.push(file);
    }
    const combined = [...files, ...accepted].slice(0, max);
    if (files.length + accepted.length > max) setError(`You can attach up to ${max} images.`);
    else if (accepted.length) setError('');
    onChange(combined);
  };

  const remove = (index) => {
    onChange(files.filter((_, i) => i !== index));
    setError('');
  };

  return (
    <div>
      <div
        className="upload-zone"
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        style={dragOver ? { borderColor: 'var(--brand-primary)', background: 'var(--bg-linen)' } : undefined}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          style={{ display: 'none' }}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--brand-primary)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
          {hint} • {files.length}/{max} attached
        </div>
      </div>

      {error ? (
        <div className="field-error" role="alert" style={{ marginTop: 6 }}>
          {error}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="upload-grid">
          {files.map((file, index) => (
            <div className="upload-thumb" key={`${file.name}-${index}`}>
              <img src={URL.createObjectURL(file)} alt={`Preview of ${file.name}`} />
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => remove(index)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <Button variant="ghost" size="sm" type="button" onClick={() => onChange([])} style={{ marginTop: 8 }}>
          Clear all
        </Button>
      ) : null}
    </div>
  );
}
