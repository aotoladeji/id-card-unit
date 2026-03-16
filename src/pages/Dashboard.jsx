import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import '../styles/dashboard.css';
import ChangePasswordModal from '../components/ChangePasswordModal';
import UserProfile from './UserProfile';
import SchedulingManagement from './supervisor/SchedulingManagement';
import itmsLogo from '../assets/itms_logo.png';





// Admin imports
import Overview from './admin/Overview';
import UserManagement from './admin/UserManagement';
import SystemLogs from './admin/SystemLogs';
import Analytics from './admin/Analytics';
import AllReports from './admin/AllReports';
import InventoryManagement from './admin/InventoryManagement';
import FaultyDeliveryManagement from './admin/FaultyDeliveryManagement';
import MaterialRequestManagement from './admin/MaterialRequestManagement';
import PrintHistory from './admin/PrintHistory';


// Supervisor imports
import SupervisorOverview from './supervisor/SupervisorOverview';
import ReprintApproval from './supervisor/ReprintApproval';
import MaterialRequestsApproval from './supervisor/MaterialRequestsApproval';
import DailyReportsReview from './supervisor/DailyReportsReview';
import StaffManagement from './supervisor/StaffManagement';
import FaultyDeliveryReview from './supervisor/FaultyDeliveryReview';
import InventoryOverview from './supervisor/InventoryOverview';

// Staff imports
import StaffOverview from './staff/StaffOverview';
import InventoryLog from './staff/InventoryLog';
import ReprintRequests from './staff/ReprintRequests';
import MaterialRequests from './staff/MaterialRequests';
import DailyReportSubmission from './staff/DailyReportSubmission';
import CardApproval from './staff/CardApproval';
import PrintQueue from './staff/PrintQueue';
import Collections from './staff/Collections';



export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [sidebarMode, setSidebarMode] = useState(
    () => localStorage.getItem('navMode') === 'sidebar'
  );

  const toggleNavMode = () => {
    setSidebarMode(prev => {
      const next = !prev;
      localStorage.setItem('navMode', next ? 'sidebar' : 'navbar');
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    // Optionally, you can logout and require re-login
    logout();
    navigate('/login');
  };

  // Define tabs based on user role
// Update getTabs - add profile to ALL roles
const getTabs = () => {
  if (user?.role === 'admin') {
    return [
      { id: 'overview', label: '🏠 Overview' },
      { id: 'users', label: '👥 User Management' },
      { id: 'inventory', label: '📦 Inventory' },
      { id: 'faulty-deliveries', label: '⚠️ Faulty Deliveries' },
      { id: 'material-requests', label: '📦 Material Requests' },
      { id: 'print-history', label: '📋 Print History' }, 
      { id: 'collections', label: '🎴 Collections' },    
      { id: 'logs', label: '📋 System Logs' },
      { id: 'analytics', label: '📊 Analytics' },
      { id: 'reports', label: '📄 Reports' },
      { id: 'profile', label: '👤 Profile' }
    ];
  } else if (user?.role === 'supervisor') {
    return [
      { id: 'overview', label: '🏠 Overview' },
      { id: 'inventory-overview', label: '📦 Inventory' },
      { id: 'faulty-deliveries', label: '⚠️ Faulty Deliveries' },
      { id: 'reprint', label: '🔄 Reprint Approvals' },
      { id: 'material', label: '📦 Material Requests' },
      { id: 'daily-reports', label: '📊 Daily Reports' },
      { id: 'staff', label: '👥 Staff Management' },
      { id: 'collections', label: '📈 Collections' },
      { id: 'print-history', label: '📋 Print History' },
      { id: 'scheduling', label: '📅 Scheduling' },
      { id: 'profile', label: '👤 Profile' }
    ];
  } else {
    const permissions = user?.permissions || [];
    const tabs = [{ id: 'overview', label: '🏠 Dashboard' }];
    if (permissions.includes('inventory')) tabs.push({ id: 'inventory', label: '📦 Inventory' });
    if (permissions.includes('reprint')) tabs.push({ id: 'reprint', label: '🔄 Reprint Requests' });
    if (permissions.includes('material')) tabs.push({ id: 'material', label: '📦 Material Requests' });
    if (permissions.includes('daily-report')) tabs.push({ id: 'daily-report', label: '📊 Daily Reports' });
    if (permissions.includes('collection')) tabs.push({ id: 'collection', label: '🎴 Collection' });
    if (permissions.includes('approval')) tabs.push({ id: 'approval', label: '✓ Card Approval' });
    if (permissions.includes('printing')) tabs.push({ id: 'print-queue', label: '🖨️ Print Queue' });
    if (permissions.includes('scheduling')) tabs.push({ id: 'scheduling', label: '📅 Scheduling' });

    tabs.push({ id: 'profile', label: '👤 Profile' }); // Always available
    return tabs;
  }
};

// Update renderContent - profile check at the TOP before role checks
const renderContent = () => {
  // Profile available to ALL users
  if (activeTab === 'profile') return <UserProfile />;
  if (activeTab === 'scheduling') return <SchedulingManagement />;
  if (activeTab === 'print-queue') return <PrintQueue />;       
  if (activeTab === 'print-history') return <PrintHistory />; 

  // Admin tabs
  if (user?.role === 'admin') {
    switch (activeTab) {
      case 'overview': return <Overview user={user} onNavigate={setActiveTab} />;
      case 'users': return <UserManagement />;
      case 'inventory': return <InventoryManagement />;
      case 'faulty-deliveries': return <FaultyDeliveryManagement />;
      case 'material-requests': return <MaterialRequestManagement />;
      case 'collections': return <Collections />;
      case 'logs': return <SystemLogs />;
      case 'analytics': return <Analytics />;
      case 'reports': return <AllReports />;
      default: return null;
    }
  }

  // Supervisor tabs
  if (user?.role === 'supervisor') {
    switch (activeTab) {
      case 'overview': return <SupervisorOverview user={user} onNavigate={setActiveTab} />;
      case 'inventory-overview': return <InventoryOverview />;
      case 'faulty-deliveries': return <FaultyDeliveryReview />;
      case 'reprint': return <ReprintApproval />;
      case 'material': return <MaterialRequestsApproval />;
      case 'daily-reports': return <DailyReportsReview />;
      case 'staff': return <StaffManagement />;
      case 'collections': return <Collections />;
      case 'print-history': return <PrintHistory />;
      default: return null;
    }
  }

  // Staff tabs
  switch (activeTab) {
    case 'overview': return <StaffOverview user={user} />;
    case 'inventory': return <InventoryLog />;
    case 'reprint': return <ReprintRequests />;
    case 'material': return <MaterialRequests />;
    case 'daily-report': return <DailyReportSubmission />;
    case 'collection': return <Collections />;
    case 'approval': return <CardApproval />;
    case 'print-queue': return <PrintQueue />;
    default: return null;
  }
};
  const tabs = getTabs();

  return (
    <div className={`dashboard-container${sidebarMode ? ' sidebar-mode' : ''}`}>
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-branding">
          {sidebarMode && (
            <button
              className="btn btn-secondary btn-sm sidebar-collapse-btn"
              onClick={toggleNavMode}
              title="Switch to top navbar"
            >
              ☰
            </button>
          )}
          <img src={itmsLogo} alt="IT@MS University of Ibadan Logo" className="header-logo" />
          <h1>MIS ID Card System</h1>
        </div>
       
        <div className="user-info">
          <span style={{ color: 'var(--text-dim)' }}>
            {user?.name}
          </span>
          <span className={`badge badge-${
            user?.role === 'admin' ? 'danger' : 
            user?.role === 'supervisor' ? 'warning' : 
            'info'
          }`}>
            {user?.role?.toUpperCase()}
          </span>
          {!sidebarMode && (
            <button
              onClick={toggleNavMode}
              className="btn btn-secondary btn-sm"
              title="Switch to sidebar navigation"
            >
              ☰ Sidebar
            </button>
          )}
          <button 
            onClick={() => setShowChangePassword(true)} 
            className="btn btn-secondary btn-sm"
          >
            🔒 Change Password
          </button>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm">
            🚪 Logout
          </button>
        </div>
      </header>

      {sidebarMode ? (
        <div className="dashboard-body">
          {/* Sidebar */}
          <aside className="dashboard-sidebar">
            <nav className="sidebar-nav">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </aside>
          {/* Content */}
          <main className="dashboard-content">
            {renderContent()}
          </main>
        </div>
      ) : (
        <>
          {/* Top Navigation */}
          <nav className="dashboard-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {/* Content */}
          <main className="dashboard-content">
            {renderContent()}
          </main>
        </>
      )}

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal 
          onSuccess={handlePasswordChanged}
          onClose={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
}