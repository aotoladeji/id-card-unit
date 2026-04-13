import { useState } from 'react';
import Modal from '../Modal';

export default function PrintCardModal({ card, onClose, onPrintComplete }) {
  const [printMethod, setPrintMethod] = useState('browser');
  const [printing, setPrinting] = useState(false);

  console.log('PrintCardModal rendered with card:', card);

  const handlePrint = async () => {
    console.log('=== PRINT BUTTON CLICKED ===');
    console.log('Print method:', printMethod);
    console.log('Card data:', card);
    
    setPrinting(true);

    try {
      if (printMethod === 'browser') {
        console.log('Starting browser print...');
        await printWithBrowser();
        console.log('Browser print completed, marking as printed...');
        await markAsPrinted();
      } else if (printMethod === 'pdf') {
        console.log('Starting PDF generation...');
        await generatePDF();
        await markAsPrinted();
      } else if (printMethod === 'direct') {
        console.log('Starting direct print...');
        await sendToDirectPrinter();
        await markAsPrinted();
      }
      
      // Success - close modal and notify
      console.log('Print completed successfully');
    } catch (error) {
      console.error('Print error:', error);
      alert('Error printing card: ' + error.message);
    } finally {
      setPrinting(false);
    }
  };

  const printWithBrowser = async () => {
    try {
      console.log('🖨️ Fetching card from capture app via backend proxy...');
      // Fetch the generated card image through our backend proxy (avoids CORS)
      const response = await fetch(`/api/card-images/${card.card_id}/image`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch card. Make sure capture app is running.');
      }

      const blob = await response.blob();
      console.log('✅ Card fetched successfully');
      console.log('   Size:', blob.size, 'bytes');
      console.log('   Type:', blob.type);
      
      if (blob.size === 0) {
        console.error('❌ Image blob is empty!');
        throw new Error('Image blob is empty - check if card ID is valid');
      }

      const imageUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to convert image to data URL'));
        reader.readAsDataURL(blob);
      });
      console.log('✅ Data URL created for print preview');
      console.log('📖 Opening print window...');

      // Open print window with the generated card
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print ID Card</title>
          <style>
            @page {
              size: 85.6mm 53.98mm;
              margin: 0;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              width: 85.6mm;
              height: 53.98mm;
              overflow: hidden;
              background: #fff;
            }
            img {
              display: block;
              width: 85.6mm;
              height: 53.98mm;
              object-fit: fill;
            }
          </style>
        </head>
        <body>
          <img src="${imageUrl}" alt="ID Card" id="cardImage" />
          <script>
            const img = document.getElementById('cardImage');
            let printed = false;
            function doPrint() {
              if (printed) return;
              printed = true;
              window.print();
            }
            img.onload = function() { setTimeout(doPrint, 300); };
            img.onerror = function() { setTimeout(doPrint, 300); };
            setTimeout(doPrint, 2000);
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();

      // Wait for print dialog and user action (extended time)
      await new Promise((resolve) => {
        setTimeout(() => {
          printWindow.close();
          resolve();
        }, 8000);
      });
    } catch (error) {
      console.error('Browser print error:', error);
      throw error;
    }
  };

  const generatePDF = async () => {
    try {
      const response = await fetch(`/api/print-queue/${card.id}/generate-pdf`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate PDF');
      }

      // For now, just show the message since PDF generation isn't fully implemented
      alert(data.message);
    } catch (error) {
      throw new Error('Failed to generate PDF: ' + error.message);
    }
  };

  const sendToDirectPrinter = async () => {
    try {
      const response = await fetch(`/api/print-queue/${card.id}/print-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          printerName: 'Default Printer'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send to printer');
      }

      // For now, just show the message since direct printing isn't fully implemented
      alert(data.message);
    } catch (error) {
      throw new Error('Failed to send to printer: ' + error.message);
    }
  };

  const markAsPrinted = async () => {
    try {
      const response = await fetch(`/api/print-queue/${card.id}/printed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          printerName: printMethod === 'direct' ? 'Default Printer' : 'Browser',
          quality: 'high'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to mark as printed');
      }

      onPrintComplete();
    } catch (error) {
      throw new Error('Failed to update database: ' + error.message);
    }
  };

  return (
    <Modal onClose={onClose} title="🖨️ Print ID Card">
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
          <label style={{ 
            display: 'block', 
            marginBottom: '0.75rem', 
            fontWeight: '600',
            color: 'var(--text)'
          }}>
            Select Print Method:
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              background: printMethod === 'browser' ? 'var(--primary-light)' : 'var(--bg)',
              border: `2px solid ${printMethod === 'browser' ? 'var(--secondary)' : 'var(--border)'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                name="printMethod"
                value="browser"
                checked={printMethod === 'browser'}
                onChange={(e) => setPrintMethod(e.target.value)}
                style={{ marginTop: '2px' }}
              />
              <div>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text)' }}>
                  🌐 Browser Print
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  Opens print dialog in your browser. Best for quick printing.
                </div>
              </div>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              background: printMethod === 'pdf' ? 'var(--primary-light)' : 'var(--bg)',
              border: `2px solid ${printMethod === 'pdf' ? 'var(--secondary)' : 'var(--border)'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                name="printMethod"
                value="pdf"
                checked={printMethod === 'pdf'}
                onChange={(e) => setPrintMethod(e.target.value)}
                style={{ marginTop: '2px' }}
              />
              <div>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text)' }}>
                  📄 Generate PDF
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  Downloads a PDF file. Best for professional card printers.
                </div>
              </div>
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              background: printMethod === 'direct' ? 'var(--primary-light)' : 'var(--bg)',
              border: `2px solid ${printMethod === 'direct' ? 'var(--secondary)' : 'var(--border)'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                name="printMethod"
                value="direct"
                checked={printMethod === 'direct'}
                onChange={(e) => setPrintMethod(e.target.value)}
                style={{ marginTop: '2px' }}
              />
              <div>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text)' }}>
                  🖨️ Direct to Printer
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  Sends directly to system printer. Requires printer setup.
                </div>
              </div>
            </label>
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
            {printing ? '⏳ Printing...' : '🖨️ Print Card'}
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
