import { useEffect, useState } from 'react';
import Modal from '../Modal';

export default function PrintCardModal({ card, onClose, onPrint, printing = false }) {
  const [svgMarkup, setSvgMarkup] = useState('');
  const [loadingSvg, setLoadingSvg] = useState(true);
  const [svgError, setSvgError] = useState('');
  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadSvg = async () => {
      setLoadingSvg(true);
      setSvgError('');
      setSvgMarkup('');

      try {
        const response = await fetch(`/api/card-images/${card.card_id}/svg`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) {
          let message = 'Failed to load card SVG preview';
          try {
            const payload = await response.json();
            message = payload.message || message;
          } catch (error) {
            message = `Failed to load SVG preview (${response.status})`;
          }
          throw new Error(message);
        }

        const svgText = await response.text();
        if (!svgText || !svgText.includes('<svg')) {
          throw new Error('Invalid SVG preview payload');
        }

        if (isMounted) {
          setSvgMarkup(svgText);
        }
      } catch (error) {
        if (isMounted) {
          setSvgError(error.message || 'Could not load SVG preview');
        }
      } finally {
        if (isMounted) {
          setLoadingSvg(false);
        }
      }
    };

    loadSvg();
    return () => {
      isMounted = false;
    };
  }, [card.card_id, previewReloadKey]);

  const handlePrint = async () => {
    if (loadingSvg) {
      alert('SVG preview is still loading. Please wait a moment and try again.');
      return;
    }

    if (svgError) {
      alert(svgError);
      return;
    }

    if (!onPrint) return;
    await onPrint(card);
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="🖨️ Print ID Card">
      <div style={{ padding: '1rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text)' }}>
            {card.surname} {card.other_names}
          </h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {card.matric_no || card.staff_id} • {card.department}
          </p>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '600', color: 'var(--text)' }}>
            SVG Preview:
          </label>
          <div style={{
            width: '100%',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem',
            minHeight: '220px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {loadingSvg && <div style={{ color: 'var(--text-dim)' }}>Loading SVG preview...</div>}
            {!loadingSvg && svgError && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--danger)', marginBottom: '0.75rem' }}>{svgError}</div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPreviewReloadKey((prev) => prev + 1)}
                >
                  🔄 Retry SVG Preview
                </button>
              </div>
            )}
            {!loadingSvg && !svgError && (
              <div
                style={{ width: '100%', maxWidth: '420px' }}
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {printing ? '⏳ Printing SVG...' : '🖨️ Print SVG'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
