import { useState, useEffect } from 'react';
import { showNotification } from '../../utils/errorHandler';

export default function ReprintApproval() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/reprint', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests);
      } else {
        showNotification(data.message || 'Failed to fetch requests', 'error');
      }
    } catch (error) {
      console.error('Error fetching reprint requests:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (id, approved) => {
    const status = approved ? 'approved' : 'rejected';
    const notes = approved ? 'Approved by supervisor' : 'Rejected by supervisor';

    try {
      const response = await fetch(`/api/reprint/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status, notes })
      });

      const data = await response.json();

      if (response.ok) {
        setRequests(requests.map(req => 
          req.id === id ? data.request : req
        ));
        showNotification(`Request ${status} successfully`, 'success');
      } else {
        showNotification(data.message || 'Failed to update request', 'error');
      }
    } catch (error) {
      console.error('Error updating request:', error);
      showNotification('Unable to connect to server', 'error');
    }
  };

  const filteredRequests = requests.filter(req => {
    if (filter === 'all') return true;
    return req.status === filter;
  });

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px' 
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div>Loading requests...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>🔄 Reprint Approvals</h1>
        <div className="btn-group">
          <button 
            className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={`btn btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button 
            className={`btn btn-sm ${filter === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('approved')}
          >
            Approved
          </button>
          <button 
            className={`btn btn-sm ${filter === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('rejected')}
          >
            Rejected
          </button>
        </div>
      </div>

      <div className="card">
        {filteredRequests.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <p>No reprint requests found</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Matric Number</th>
                <th>Student Name</th>
                <th>Reason</th>
                <th>Requested By</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(req => (
                <tr key={req.id}>
                  <td>{req.matric_number}</td>
                  <td>{req.student_name}</td>
                  <td style={{ maxWidth: '250px' }}>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {req.reason}
                    </div>
                  </td>
                  <td>{req.requested_by_username}</td>
                  <td>{new Date(req.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge badge-${
                      req.status === 'approved' ? 'success' : 
                      req.status === 'rejected' ? 'danger' : 
                      'warning'
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td>
                    {req.status === 'pending' && (
                      <div className="btn-group">
                        <button 
                          className="btn btn-success btn-sm"
                          onClick={() => handleApproval(req.id, true)}
                        >
                          ✓ Approve
                        </button>
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleApproval(req.id, false)}
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}