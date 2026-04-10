import { useState, useEffect } from 'react';
import { showNotification } from '../../utils/errorHandler';
import PrintCardModal from '../../components/staff/PrintCardModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export default function PrintQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [printing, setPrinting] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

  useEffect(() => {
    fetchQueue();
    
    // Auto-sync every 30 seconds (like Card Approval)
    const interval = setInterval(() => {
      console.log('[Print Queue Auto-sync] Syncing from capture app...');
      syncCards(true); // silent sync
    }, 30000);
    
    console.log('[Print Queue] Auto-sync enabled (every 30 seconds)');
    return () => {
      clearInterval(interval);
      console.log('[Print Queue] Auto-sync disabled');
    };
  }, []);

  const fetchQueue = async () => {
    try {
      const response = await fetch('/api/print-queue', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setQueue(data.queue);
      }
    } catch (error) {
      showNotification('Error fetching print queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  const syncCards = async (silent = false) => {
    if (!silent) setSyncing(true);
    
    try {
      const response = await fetch('/api/print-queue/sync', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      
      if (response.ok) {
        if (!silent) {
          showNotification(data.message, 'success');
        } else {
          console.log('[Print Queue Auto-sync] Success:', data.message);
        }
        setLastSyncTime(new Date());
        fetchQueue();
      } else {
        if (!silent) {
          showNotification(data.message, 'error');
        }
      }
    } catch (error) {
      if (!silent) {
        showNotification('Error syncing cards', 'error');
      } else {
        console.log('[Print Queue Auto-sync] Failed (capture app may be offline)');
      }
    } finally {
      if (!silent) setSyncing(false);
    }
  };

  const clearQueue = async () => {
    const confirmed = await showDialog({
      title: 'Clear Print Queue',
      message: '⚠️ Are you sure you want to clear ALL cards from the print queue? This cannot be undone!',
      type: 'confirm',
      confirmText: 'Clear Queue',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setSyncing(true);
    try {
      const response = await fetch('/api/print-queue/clear', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        showNotification(data.message || 'Print queue cleared successfully', 'success');
        setQueue([]);
        setSelectedCards([]);
      } else {
        showNotification(data.message || 'Error clearing queue', 'error');
      }
    } catch (error) {
      showNotification('Error clearing print queue', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSinglePrint = async (card) => {
    console.log('Single print clicked for card:', card.id);
    setPrinting(prev => ({ ...prev, [card.id]: true }));
    
    try {
      await printCardDirect(card);
      showNotification('Card printed successfully and moved to collection log!', 'success');
      // Refresh the queue to remove the printed card
      await fetchQueue();
    } catch (error) {
      console.error('Print error:', error);
      showNotification('Error printing card: ' + error.message, 'error');
    } finally {
      setPrinting(prev => ({ ...prev, [card.id]: false }));
    }
  };

  const printCard = (card) => {
    setSelectedCard(card);
  };

  const handlePrintComplete = () => {
    showNotification('Card printed successfully!', 'success');
    setSelectedCard(null);
    fetchQueue();
  };

  const toggleSelectCard = (cardId) => {
    setSelectedCards(prev => 
      prev.includes(cardId) 
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId]
    );
  };

  const toggleSelectAll = () => {
    const queuedCards = queue.filter(c => c.status === 'queued');
    if (selectedCards.length === queuedCards.length) {
      setSelectedCards([]);
    } else {
      setSelectedCards(queuedCards.map(c => c.id));
    }
  };

  const printSelected = async () => {
    if (selectedCards.length === 0) {
      showNotification('No cards selected', 'warning');
      return;
    }

    const confirmed = await showDialog({
      title: 'Print Selected Cards',
      message: `Print ${selectedCards.length} selected card(s)?`,
      type: 'confirm',
      confirmText: 'Print',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setBulkPrinting(true);
    let successCount = 0;
    let failCount = 0;

    for (const cardId of selectedCards) {
      try {
        const card = queue.find(c => c.id === cardId);
        if (card) {
          await printCardDirect(card);
          successCount++;
        }
      } catch (error) {
        console.error(`Failed to print card ${cardId}:`, error);
        failCount++;
      }
    }

    setBulkPrinting(false);
    setSelectedCards([]);
    
    const message = failCount > 0 
      ? `Printed ${successCount} card(s). ${failCount} failed. All successful prints moved to collection log.`
      : `Printed ${successCount} card(s) successfully! All moved to collection log.`;
    
    showNotification(message, failCount > 0 ? 'warning' : 'success');
    await fetchQueue();
  };

  const printAll = async () => {
    const queuedCards = queue.filter(c => c.status === 'queued');
    
    if (queuedCards.length === 0) {
      showNotification('No cards in queue', 'warning');
      return;
    }

    const confirmed = await showDialog({
      title: 'Print All Cards',
      message: `Print all ${queuedCards.length} card(s) in queue?`,
      type: 'confirm',
      confirmText: 'Print All',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setBulkPrinting(true);
    let successCount = 0;
    let failCount = 0;

    for (const card of queuedCards) {
      try {
        await printCardDirect(card);
        successCount++;
      } catch (error) {
        console.error(`Failed to print card ${card.id}:`, error);
        failCount++;
      }
    }

    setBulkPrinting(false);
    
    const message = failCount > 0 
      ? `Printed ${successCount} card(s). ${failCount} failed. All successful prints moved to collection log.`
      : `Printed all ${successCount} card(s) successfully! All moved to collection log.`;
    
    showNotification(message, failCount > 0 ? 'warning' : 'success');
    await fetchQueue();
  };

  const printCardDirect = async (card) => {
    try {
      console.log('🖨️ Fetching card image for card ID:', card.card_id);
      
      // Fetch the generated card image through our backend proxy (avoids CORS)
      const response = await fetch(`/api/card-images/${card.card_id}/image`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) {
        let errorMessage = 'Failed to fetch card from capture app';
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch (e) {
          errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        }
        console.error('❌ Error fetching card image:', errorMessage);
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      console.log('✅ Card image fetched successfully');
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
            body {
              margin: 0;
              padding: 20px;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              background: #f5f5f5;
              font-family: Arial, sans-serif;
            }
            .preview-container {
              background: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            img {
              width: 85.6mm;
              height: 53.98mm;
              object-fit: contain;
              margin-bottom: 20px;
              border: 2px solid #ddd;
              border-radius: 4px;
              background: #fff;
            }
            .print-message {
              background: #2196F3;
              color: white;
              padding: 15px 20px;
              border-radius: 4px;
              font-size: 16px;
              font-weight: bold;
              text-align: center;
              width: 100%;
              max-width: 400px;
              animation: pulse 1.5s ease-in-out infinite;
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.8; }
            }
            .countdown {
              color: #666;
              font-size: 14px;
              margin-top: 10px;
              text-align: center;
            }
            .error {
              color: #d32f2f;
              font-size: 14px;
              margin-top: 10px;
              padding: 10px;
              background: #ffebee;
              border-radius: 4px;
              display: none;
            }
          </style>
        </head>
        <body>
          <div class="preview-container">
            <div class="print-message">📋 Review the card below</div>
            <img src="${imageUrl}" alt="ID Card" id="cardImage" />
            <div class="error" id="error"></div>
            <div class="countdown">
              ⏳ Print dialog will open in <span id="countdown">5</span> seconds...
            </div>
          </div>
          <script>
            const img = document.getElementById('cardImage');
            const errorDiv = document.getElementById('error');
            const countdownEl = document.getElementById('countdown');
            let count = 5;
            let printStarted = false;

            img.onerror = function() {
              errorDiv.style.display = 'block';
              errorDiv.textContent = '❌ Image failed to load. URL may have expired.';
              console.error('Image failed to load from:', img.src);
            };

            img.onload = function() {
              console.log('Image loaded successfully');
              if (!printStarted) {
                startCountdown();
              }
            };

            function startCountdown() {
              printStarted = true;
              const timer = setInterval(() => {
                count--;
                countdownEl.textContent = count;
                if (count <= 0) {
                  clearInterval(timer);
                  window.print();
                }
              }, 1000);
            }

            // Fallback: start countdown after 2 seconds even if image doesn't load
            setTimeout(() => {
              if (!printStarted) {
                console.warn('Image took too long to load, starting countdown anyway');
                startCountdown();
              }
            }, 2000);
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

      // Mark as printed in both systems
      const markResponse = await fetch(`/api/print-queue/${card.id}/printed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          printerName: 'Browser',
          quality: 'high'
        })
      });

      if (!markResponse.ok) {
        let backendMessage = 'Failed to mark card as printed in local database';
        try {
          const errorData = await markResponse.json();
          backendMessage = errorData.message || backendMessage;
        } catch (e) {
          backendMessage = `Failed to mark card as printed (status ${markResponse.status})`;
        }
        throw new Error(backendMessage);
      } else {
        console.log('✅ Card marked as printed in local database');
      }

      // Small delay to ensure backend transaction completes
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error('Print error:', error);
      
      // Provide helpful error messages
      if (error.message.includes('Capture app is not available')) {
        throw new Error('Capture app is offline. Please ensure it is running on port 5001.');
      } else if (error.message.includes('not found')) {
        throw new Error('Card image not found. The capture app may not have generated this card yet.');
      } else if (error.message.includes('Pop-up blocked')) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site to print cards.');
      }
      
      throw error;
    }
  };

  const generateCardHTML = (card) => {
    const photoUrl = card.passport_photo 
      ? `data:image/jpeg;base64,${card.passport_photo}`
      : 'https://via.placeholder.com/150';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>ID Card - ${card.surname} ${card.other_names}</title>
        <style>
          @page {
            size: 85.6mm 53.98mm;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
          }
          .card {
            width: 85.6mm;
            height: 53.98mm;
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            position: relative;
            overflow: hidden;
            page-break-after: always;
          }
          .card-header {
            background: rgba(255, 255, 255, 0.95);
            padding: 8px;
            text-align: center;
            border-bottom: 3px solid #f59e0b;
          }
          .card-header h1 {
            margin: 0;
            font-size: 14px;
            color: #1e3a8a;
            font-weight: bold;
          }
          .card-header p {
            margin: 2px 0 0 0;
            font-size: 9px;
            color: #64748b;
          }
          .card-body {
            display: flex;
            padding: 10px;
            gap: 10px;
          }
          .photo {
            width: 100px;
            height: 120px;
            background: white;
            border: 2px solid white;
            border-radius: 4px;
            overflow: hidden;
          }
          .photo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .details {
            flex: 1;
            color: white;
          }
          .details .field {
            margin-bottom: 6px;
          }
          .details .label {
            font-size: 8px;
            opacity: 0.8;
            text-transform: uppercase;
          }
          .details .value {
            font-size: 11px;
            font-weight: bold;
          }
          .card-footer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.3);
            padding: 4px 8px;
            text-align: center;
            color: white;
            font-size: 8px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="card-header">
            <h1>UNIVERSITY OF IBADAN</h1>
            <p>Management Information Systems</p>
          </div>
          <div class="card-body">
            <div class="photo">
              <img src="${photoUrl}" alt="Photo" />
            </div>
            <div class="details">
              <div class="field">
                <div class="label">Name</div>
                <div class="value">${card.surname} ${card.other_names}</div>
              </div>
              <div class="field">
                <div class="label">${card.matric_no ? 'Matric No' : 'Staff ID'}</div>
                <div class="value">${card.matric_no || card.staff_id}</div>
              </div>
              <div class="field">
                <div class="label">Department</div>
                <div class="value">${card.department}</div>
              </div>
              <div class="field">
                <div class="label">Faculty</div>
                <div class="value">${card.faculty}</div>
              </div>
              ${card.level ? `
              <div class="field">
                <div class="label">Level</div>
                <div class="value">${card.level}</div>
              </div>
              ` : ''}
            </div>
          </div>
          <div class="card-footer">
            Card No: ${card.card_number || 'N/A'} | Session: ${card.session || 'N/A'}
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const markAsFailed = async (id) => {
    const error = await showDialog({
      title: 'Mark as Failed',
      message: 'Enter error reason:',
      type: 'prompt',
      placeholder: 'Describe the error...',
      confirmText: 'Mark as Failed',
      cancelText: 'Cancel'
    });
    
    if (!error) return;

    try {
      const response = await fetch(`/api/print-queue/${id}/failed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ error })
      });

      if (response.ok) {
        showNotification('Card marked as failed', 'warning');
        fetchQueue();
      }
    } catch (error) {
      showNotification('Error updating status', 'error');
    }
  };

  const deleteCard = async (id, name) => {
    const confirmed = await showDialog({
      title: 'Delete Card',
      message: `Are you sure you want to DELETE this card from the queue?\n\n${name}\n\nThis cannot be undone.`,
      type: 'confirm',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/print-queue/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        showNotification('Card removed from queue', 'success');
        fetchQueue();
      } else {
        const data = await response.json();
        showNotification(data.message || 'Error deleting card', 'error');
      }
    } catch (error) {
      showNotification('Error deleting card', 'error');
    }
  };

  const retryPrint = async (id) => {
    try {
      const response = await fetch(`/api/print-queue/${id}/retry`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        showNotification('Card queued for retry', 'success');
        fetchQueue();
      }
    } catch (error) {
      showNotification('Error retrying print', 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <div>Loading print queue...</div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>🖨️ Print Queue</h1>
          {lastSyncTime && (
            <div style={{ 
              fontSize: '0.85rem', 
              color: 'var(--text-dim)',
              marginTop: '0.25rem'
            }}>
              Last synced: {lastSyncTime.toLocaleTimeString()} • Auto-sync every 30s
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {selectedCards.length > 0 && (
            <button 
              className="btn btn-success" 
              onClick={printSelected}
              disabled={bulkPrinting}
            >
              {bulkPrinting ? '⏳ Printing...' : `🖨️ Print Selected (${selectedCards.length})`}
            </button>
          )}
          <button 
            className="btn btn-warning" 
            onClick={printAll}
            disabled={bulkPrinting || queue.filter(c => c.status === 'queued').length === 0}
          >
            {bulkPrinting ? '⏳ Printing...' : '🖨️ Print All'}
          </button>
          <button 
            className="btn btn-primary" 
            onClick={syncCards}
            disabled={syncing}
          >
            {syncing ? '⏳ Syncing...' : '🔄 Sync Cards'}
          </button>
          {queue.length > 0 && (
            <button 
              className="btn btn-danger" 
              onClick={clearQueue}
              disabled={syncing}
            >
              {syncing ? '⏳ Clearing...' : '🗑️ Clear Queue'}
            </button>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
            No cards in print queue
          </p>
          <button className="btn btn-primary" onClick={syncCards} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Cards'}
          </button>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  Total in Queue
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--primary)' }}>
                  {queue.filter(c => c.status === 'queued').length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  Currently Printing
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--warning)' }}>
                  {queue.filter(c => c.status === 'printing').length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  Failed
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--danger)' }}>
                  {queue.filter(c => c.status === 'failed').length}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedCards.length === queue.filter(c => c.status === 'queued').length && queue.filter(c => c.status === 'queued').length > 0}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Name</th>
                  <th>ID Number</th>
                  <th>Card Number</th>
                  <th>Department</th>
                  <th>Added</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(card => (
                  <tr key={card.id}>
                    <td>
                      {card.status === 'queued' && (
                        <input
                          type="checkbox"
                          checked={selectedCards.includes(card.id)}
                          onChange={() => toggleSelectCard(card.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      )}
                    </td>
                    <td>
                      <strong>{card.surname}</strong> {card.other_names}
                    </td>
                    <td>{card.matric_no || card.staff_id || '—'}</td>
                    <td>{card.card_number || '—'}</td>
                    <td>
                      <div>{card.department}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                        {card.faculty}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {new Date(card.added_to_queue_at).toLocaleDateString()}
                    </td>
                    <td>
                      {card.status === 'queued' && (
                        <span className="badge badge-info">Queued</span>
                      )}
                      {card.status === 'printing' && (
                        <span className="badge badge-warning">Printing</span>
                      )}
                      {card.status === 'failed' && (
                        <span className="badge badge-danger">Failed</span>
                      )}
                    </td>
                    <td>
                      <div className="btn-group">
                        {card.status === 'queued' && (
                          <>
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleSinglePrint(card)}
                              disabled={printing[card.id]}
                            >
                              {printing[card.id] ? '⏳' : '🖨️ Print'}
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => markAsFailed(card.id)}
                            >
                              ❌ Fail
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => deleteCard(card.id, `${card.surname} ${card.other_names}`)}
                              title="Remove from queue"
                            >
                              🗑️ Delete
                            </button>
                          </>
                        )}
                        {card.status === 'failed' && (
                          <>
                            <button
                              className="btn btn-warning btn-sm"
                              onClick={() => retryPrint(card.id)}
                            >
                              🔄 Retry
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              title={card.last_error}
                            >
                              ℹ️ Error
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => deleteCard(card.id, `${card.surname} ${card.other_names}`)}
                              title="Remove from queue"
                            >
                              🗑️ Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedCard && (
        <PrintCardModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onPrintComplete={handlePrintComplete}
        />
      )}

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        placeholder={dialogState.placeholder}
        fields={dialogState.fields}
      />
    </>
  );
}