import React from 'react';
import { Button } from './ui';

/**
 * Displays a REAL server generated PNG QR code.
 * The payload contains only a tracking URL with an opaque token — never
 * personal data, serial numbers or storage locations.
 */
export function QRPass({ qr, reportCode, compact = false, onDownload, onPrint }) {
  if (!qr) {
    return (
      <div className="notice notice-warn">
        <span>QR pass not available yet for this record.</span>
      </div>
    );
  }
  const src = qr.image_url || `/api/qr/${qr.id}/image`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div className="qr-pass">
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--brand-primary)' }}>
          Verified Custody Pass
        </div>
        <img src={src} alt={`QR code for report ${reportCode || qr.code}`} width={148} height={148} />
        <div className="qr-caption">
          <strong className="tabular mono">{reportCode || qr.code}</strong>
          <span>Contains no personal information</span>
        </div>
      </div>
      {!compact ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="secondary" size="sm" onClick={onDownload} type="button">
            Download PNG
          </Button>
          <Button variant="secondary" size="sm" onClick={onPrint} type="button">
            Print pass
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function downloadQr(qr, reportCode) {
  if (!qr) return;
  const link = document.createElement('a');
  link.href = qr.image_url || `/api/qr/${qr.id}/image`;
  link.download = `${reportCode || qr.code}-custody-pass.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function printQr(qr, reportCode, itemName = '') {
  if (!qr) return;
  const src = qr.image_url || `/api/qr/${qr.id}/image`;
  const win = window.open('', '_blank', 'width=520,height=680');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Custody pass ${reportCode}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;padding:32px;color:#142822;text-align:center}
      h1{font-size:16px;letter-spacing:.08em;text-transform:uppercase}
      .code{font-family:monospace;font-size:19px;font-weight:700;margin:10px 0}
      img{width:260px;height:260px;image-rendering:pixelated}
      p{font-size:11px;color:#57534E;max-width:300px;margin:12px auto}
      .rule{border-top:1px dashed #D1CBC0;margin:16px 0}
    </style></head><body>
    <h1>Lost &amp; Found Campus</h1>
    <div>Verified Custody Pass</div>
    <img src="${window.location.origin}${src}" alt="QR" />
    <div class="code">${reportCode || qr.code}</div>
    <div>${itemName || ''}</div>
    <div class="rule"></div>
    <p>Present this pass at the campus custody desk. The code contains no personal information.
    Scanning it reveals only the public report status.</p>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`);
  win.document.close();
}
