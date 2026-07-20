'use client';

import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  TrendingUp, 
  Trash2, 
  RefreshCw, 
  Shield, 
  Plus, 
  Tag, 
  Sliders, 
  HelpCircle, 
  Send,
  CheckCircle2,
  Smartphone,
  Info
} from 'lucide-react';
import { parseSMS, getAutoBrand } from '../lib/smsParser';

// Types
interface Transaction {
  id: string;
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  timestamp: string;
  isCreditLineReset: boolean;
  raw: string;
  isExcluded?: boolean;
}

interface UPIMapping {
  upiId: string;
  friendlyName: string;
}

export default function Home() {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'mappings' | 'simulator' | 'settings'>('dashboard');

  // Application State
  const [creditBase, setCreditBase] = useState<number>(5000);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [mappings, setMappings] = useState<UPIMapping[]>([]);
  const [syncToken, setSyncToken] = useState<string>('');
  const [isSynced, setIsSynced] = useState<boolean>(true);
  const [smsCutoffTime, setSmsCutoffTime] = useState<string>('');

  // Manual Transaction Form
  const [isManualFormOpen, setIsManualFormOpen] = useState<boolean>(false);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualType, setManualType] = useState<'debit' | 'credit'>('debit');
  const [manualMerchant, setManualMerchant] = useState<string>('');
  const [manualIsReset, setManualIsReset] = useState<boolean>(false);

  // Form Inputs
  const [editingMappingUpi, setEditingMappingUpi] = useState<string | null>(null);
  const [editingMappingName, setEditingMappingName] = useState<string>('');
  
  const [newMappingUpi, setNewMappingUpi] = useState<string>('');
  const [newMappingName, setNewMappingName] = useState<string>('');

  const [simSMS, setSimSMS] = useState<string>(
    'Your A/c x1234 is debited by Rs.250.00 on 16-07-26. Info: UPI-9876543210@paytm.'
  );
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  // Load data from Backend Sync API
  const loadFromBackend = async (token: string) => {
    setIsSynced(false);
    try {
      const res = await fetch(`/api/sync?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (data.transactions) {
          setTransactions(data.transactions);
          localStorage.setItem('fm_transactions', JSON.stringify(data.transactions));
        }
        if (data.mappings) {
          setMappings(data.mappings);
          localStorage.setItem('fm_mappings', JSON.stringify(data.mappings));
        }
        if (data.creditBase !== undefined) {
          setCreditBase(data.creditBase);
          localStorage.setItem('fm_credit_base', data.creditBase.toString());
        }
        if (data.smsCutoffTime) {
          setSmsCutoffTime(data.smsCutoffTime);
          localStorage.setItem('fm_sms_cutoff_time', data.smsCutoffTime);
        }
        setIsSynced(true);
      } else {
        console.warn('Backend sync returned error status:', res.status);
        triggerSyncMock();
      }
    } catch (e) {
      console.error('Failed to load from backend:', e);
      triggerSyncMock();
    }
  };

  // Push changes to Backend Sync API
  const pushToBackend = async (txs: Transaction[], maps: UPIMapping[], base: number, tokenStr: string, cutoff: string = smsCutoffTime) => {
    if (!tokenStr) return;
    setIsSynced(false);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenStr}`
        },
        body: JSON.stringify({
          transactions: txs,
          mappings: maps,
          creditBase: base,
          lastSync: new Date().toISOString(),
          smsCutoffTime: cutoff
        })
      });
      if (res.ok) {
        setIsSynced(true);
      }
    } catch (err) {
      console.error('Failed to push to backend:', err);
    }
  };

  // Initialize with Mock Data if nothing in localStorage
  useEffect(() => {
    const savedBase = localStorage.getItem('fm_credit_base');
    const savedTx = localStorage.getItem('fm_transactions');
    const savedMappings = localStorage.getItem('fm_mappings');
    const savedToken = localStorage.getItem('fm_sync_token');
    const savedCutoff = localStorage.getItem('fm_sms_cutoff_time');

    let tokenVal = '';

    if (savedBase) setCreditBase(parseFloat(savedBase));
    if (savedToken) {
      tokenVal = savedToken;
      setSyncToken(tokenVal);
    }
    if (savedCutoff) {
      setSmsCutoffTime(savedCutoff);
    } else {
      const nowStr = new Date().toISOString();
      setSmsCutoffTime(nowStr);
      localStorage.setItem('fm_sms_cutoff_time', nowStr);
    }

    // Initial load check
    let currentTransactions: Transaction[] = [];
    let currentMappings: UPIMapping[] = [];

    if (savedMappings) {
      currentMappings = JSON.parse(savedMappings);
      setMappings(currentMappings);
    } else {
      // Mock Mappings
      currentMappings = [
        { upiId: '9876543210@paytm', friendlyName: 'Grocery Shop' },
        { upiId: '123456', friendlyName: 'Cafe Coffee Day' },
        { upiId: 'swiggy@upi', friendlyName: 'Swiggy Food' },
      ];
      setMappings(currentMappings);
      localStorage.setItem('fm_mappings', JSON.stringify(currentMappings));
    }

    if (savedTx) {
      currentTransactions = JSON.parse(savedTx);
      setTransactions(currentTransactions);
    } else {
      // Generate some mock history starting with a Credit of 5,000
      const now = new Date();
      currentTransactions = [
        {
          id: '1',
          amount: 5000,
          type: 'credit',
          merchant: 'Salary / Reset',
          timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
          isCreditLineReset: true,
          raw: 'Dear Customer, A/c X1234 has been credited with Rs 5000.00 on 14-07-26. Credit line started.'
        },
        {
          id: '2',
          amount: 250,
          type: 'debit',
          merchant: '9876543210@paytm', // matches grocery shop
          timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
          isDebit: true,
          isCreditLineReset: false,
          raw: 'Your A/c x1234 is debited by Rs.250.00 on 15-07-26. Info: UPI-9876543210@paytm.'
        } as any,
        {
          id: '3',
          amount: 80,
          type: 'debit',
          merchant: '123456', // matches coffee
          timestamp: new Date(now.getTime() - 1000 * 60 * 120).toISOString(), // 2 hours ago
          isDebit: true,
          isCreditLineReset: false,
          raw: 'Debited: INR 80.00 from A/c XX1234 on 16/07/2026. Ref: 123456'
        } as any,
        {
          id: '4',
          amount: 450,
          type: 'debit',
          merchant: 'netflix@upi', // unmapped
          timestamp: new Date(now.getTime() - 1000 * 60 * 30).toISOString(), // 30 mins ago
          isDebit: true,
          isCreditLineReset: false,
          raw: 'Rs. 450.00 debited from account ...1234 on 16-07-26 to UPI Ref netflix@upi.'
        } as any
      ];
      setTransactions(currentTransactions);
      localStorage.setItem('fm_transactions', JSON.stringify(currentTransactions));
    }

    if (tokenVal) {
      loadFromBackend(tokenVal);
    }
  }, []);

  // Save to localStorage when state changes
  const updateTransactions = (newTxs: Transaction[]) => {
    setTransactions(newTxs);
    localStorage.setItem('fm_transactions', JSON.stringify(newTxs));
    if (syncToken) {
      pushToBackend(newTxs, mappings, creditBase, syncToken, smsCutoffTime);
    } else {
      triggerSyncMock();
    }
  };

  const updateMappings = (newMaps: UPIMapping[]) => {
    setMappings(newMaps);
    localStorage.setItem('fm_mappings', JSON.stringify(newMaps));
    if (syncToken) {
      pushToBackend(transactions, newMaps, creditBase, syncToken, smsCutoffTime);
    } else {
      triggerSyncMock();
    }
  };

  const triggerSyncMock = () => {
    setIsSynced(false);
    setTimeout(() => {
      setIsSynced(true);
    }, 800);
  };

  // Calculations
  // Starting balance = find the latest credit line reset transaction amount (default 5k)
  // Deduct all debits that happened *after* that reset transaction
  const getCreditLineStatus = () => {
    const activeTxs = transactions.filter(tx => !tx.isExcluded);

    // Find index of the latest credit line reset
    const resetIndices = activeTxs
      .map((tx, idx) => (tx.isCreditLineReset || (tx.type === 'credit' && tx.amount >= creditBase) ? idx : -1))
      .filter(idx => idx !== -1);

    const latestResetIdx = resetIndices.length > 0 ? Math.max(...resetIndices) : -1;
    
    let startingBalance = creditBase;
    let relevantTxs = activeTxs;

    if (latestResetIdx !== -1) {
      startingBalance = creditBase;
      // Get all transactions after this reset (since transactions are sorted newest first, these are index 0 to latestResetIdx)
      relevantTxs = activeTxs.slice(0, latestResetIdx);
    }

    const totalDebits = relevantTxs
      .filter(tx => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const remainingBalance = startingBalance - totalDebits;
    const progressPercent = Math.max(0, Math.min(100, (remainingBalance / startingBalance) * 100));

    return {
      startingBalance,
      totalDebits,
      remainingBalance,
      progressPercent
    };
  };

  const { startingBalance, totalDebits, remainingBalance, progressPercent } = getCreditLineStatus();

  // Helper to map Merchant UPI ID to Friendly Name
  const getMerchantName = (upiId: string) => {
    const found = mappings.find(m => m.upiId.toLowerCase() === upiId.toLowerCase());
    if (found) return found.friendlyName;
    
    const autoBrand = getAutoBrand(upiId);
    if (autoBrand) return autoBrand;
    
    return upiId;
  };

  // Handlers
  const handleToggleExclude = (id: string) => {
    const updated = transactions.map(tx => 
      tx.id === id ? { ...tx, isExcluded: !tx.isExcluded } : tx
    );
    updateTransactions(updated);
  };

  const handleSaveManualTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(manualAmount);
    if (isNaN(amt) || amt <= 0) return;
    if (!manualMerchant.trim()) return;

    const newTx: Transaction = {
      id: 'manual_' + Date.now(),
      amount: amt,
      type: manualType,
      merchant: manualMerchant.trim(),
      timestamp: new Date().toISOString(),
      isCreditLineReset: manualType === 'credit' && manualIsReset,
      raw: `Manually added transaction: ${manualMerchant.trim()} (₹${amt})`
    };

    const updated = [newTx, ...transactions];
    updateTransactions(updated);

    // Reset fields
    setManualAmount('');
    setManualMerchant('');
    setManualType('debit');
    setManualIsReset(false);
    setIsManualFormOpen(false);
  };

  const handleDeleteTransaction = (id: string) => {
    const updated = transactions.filter(tx => tx.id !== id);
    updateTransactions(updated);
  };

  const handleUpdateCreditBase = (val: number) => {
    setCreditBase(val);
    localStorage.setItem('fm_credit_base', val.toString());
    if (syncToken) {
      pushToBackend(transactions, mappings, val, syncToken);
    } else {
      triggerSyncMock();
    }
  };

  const handleSaveSyncToken = (val: string) => {
    setSyncToken(val);
    localStorage.setItem('fm_sync_token', val);
    if (val) {
      loadFromBackend(val);
    } else {
      triggerSyncMock();
    }
  };

  // Inline editing for mappings
  const startEditingMapping = (upiId: string, currentFriendly: string) => {
    setEditingMappingUpi(upiId);
    setEditingMappingName(currentFriendly);
  };

  const saveInlineMapping = () => {
    if (!editingMappingUpi) return;
    const updated = mappings.map(m => 
      m.upiId === editingMappingUpi 
        ? { ...m, friendlyName: editingMappingName }
        : m
    );
    updateMappings(updated);
    setEditingMappingUpi(null);
  };

  const deleteMapping = (upiId: string) => {
    const updated = mappings.filter(m => m.upiId !== upiId);
    updateMappings(updated);
  };

  const handleAddMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMappingUpi || !newMappingName) return;
    
    // Check if UPI ID already mapped
    const exists = mappings.some(m => m.upiId.toLowerCase() === newMappingUpi.toLowerCase());
    if (exists) {
      alert('This UPI ID is already mapped! Edit it from the list below.');
      return;
    }

    const updated = [...mappings, { upiId: newMappingUpi, friendlyName: newMappingName }];
    updateMappings(updated);
    setNewMappingUpi('');
    setNewMappingName('');
  };

  // Ingest / Simulate SMS
  const handleSimulateSMS = () => {
    const parsed = parseSMS(simSMS);
    if (!parsed) {
      setSimulationResult('❌ Ignored: Not a recognized bank credit/debit SMS.');
      return;
    }

    const newTx: Transaction = {
      id: Date.now().toString(),
      amount: parsed.amount,
      type: parsed.type,
      merchant: parsed.merchant,
      timestamp: parsed.timestamp,
      isCreditLineReset: parsed.isCreditLineReset,
      raw: parsed.raw
    };

    const updated = [newTx, ...transactions];
    updateTransactions(updated);
    
    setSimulationResult(
      `✅ Success: Parsed ${parsed.type.toUpperCase()} of ₹${parsed.amount} from "${parsed.merchant}". ${
        parsed.isCreditLineReset ? '(Started new month credit line!)' : ''
      }`
    );
  };

  return (
    <main className="container">
      {/* Header */}
      <header className="flex items-center justify-between w-full mb-6">
        <div className="flex items-center gap-2">
          <div className="tx-icon-wrapper tx-icon-credit" style={{ width: '40px', height: '40px', borderRadius: '10px' }}>
            <Wallet size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Aarush's Wallet</h1>
            <p className="text-xs text-muted">Credit Manager</p>
          </div>
        </div>
      </header>

      {/* Credit Line Status Progress Card */}
      <section className="card" style={{ background: 'linear-gradient(135deg, rgba(20, 18, 33, 0.7) 0%, rgba(30, 20, 50, 0.4) 100%)' }}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Remaining Balance</span>
          <span className="badge badge-primary">Base: ₹{startingBalance}</span>
        </div>

        <div className="flex items-baseline gap-1 my-2">
          <span className="text-3xl font-extrabold text-primary">₹{remainingBalance.toLocaleString('en-IN')}</span>
          <span className="text-sm text-secondary font-medium">/ ₹{startingBalance.toLocaleString('en-IN')}</span>
        </div>

        <div className="progress-container">
          <div 
            className={`progress-bar ${remainingBalance < creditBase * 0.2 ? 'danger' : ''}`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        <div className="flex justify-between items-center text-xs text-secondary mt-2">
          <span>Spent: ₹{totalDebits.toLocaleString('en-IN')}</span>
          <span className={remainingBalance < creditBase * 0.2 ? 'text-danger font-semibold' : ''}>
            {progressPercent.toFixed(0)}% Left
          </span>
        </div>
      </section>

      {/* Desktop / Large Screen Navigation Tab Bar */}
      <nav className="tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Transactions
        </button>
        <button 
          className={`tab-btn ${activeTab === 'mappings' ? 'active' : ''}`}
          onClick={() => setActiveTab('mappings')}
        >
          UPI Mappings
        </button>
        <button 
          className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulator')}
        >
          SMS Sandbox
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </nav>

      {/* TAB CONTENT: DASHBOARD (TRANSACTIONS) */}
      {activeTab === 'dashboard' && (
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              Recent Transactions
              <span className="text-xs font-medium text-muted">({transactions.length})</span>
            </h2>
            <div className="flex gap-2">
              <button 
                className="btn btn-secondary text-xs flex items-center gap-1"
                onClick={() => setIsManualFormOpen(!isManualFormOpen)}
              >
                <Plus size={14} /> Add Manual
              </button>
              <button 
                className="text-xs text-primary font-semibold flex items-center gap-1 bg-transparent border-none cursor-pointer"
                onClick={() => {
                  // Instantly load mock baseline transaction
                  const now = new Date();
                  const resetTx: Transaction = {
                    id: Date.now().toString(),
                    amount: creditBase,
                    type: 'credit',
                    merchant: 'Salary / Reset',
                    timestamp: now.toISOString(),
                    isCreditLineReset: true,
                    raw: `Credited Rs.${creditBase}.00 to credit line starting the month.`
                  };
                  updateTransactions([resetTx, ...transactions]);
                }}
              >
                <Plus size={14} /> Start New Month
              </button>
            </div>
          </div>

          {isManualFormOpen && (
            <div className="card mb-4" style={{ marginBottom: '1rem' }}>
              <h3 className="text-sm font-bold mb-3">Add Manual Transaction</h3>
              <form onSubmit={handleSaveManualTransaction} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary font-medium">Amount (₹)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 250" 
                    className="input" 
                    value={manualAmount}
                    onChange={e => setManualAmount(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary font-medium">Merchant / Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Cafe Coffee Day" 
                    className="input" 
                    value={manualMerchant}
                    onChange={e => setManualMerchant(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-secondary font-medium">Type</label>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      className={`btn ${manualType === 'debit' ? 'btn-primary' : 'btn-secondary'}`} 
                      style={{ flex: 1 }}
                      onClick={() => setManualType('debit')}
                    >
                      Debit
                    </button>
                    <button 
                      type="button" 
                      className={`btn ${manualType === 'credit' ? 'btn-primary' : 'btn-secondary'}`} 
                      style={{ flex: 1 }}
                      onClick={() => setManualType('credit')}
                    >
                      Credit
                    </button>
                  </div>
                </div>

                {manualType === 'credit' && (
                  <div className="flex items-center gap-2 mb-1">
                    <input 
                      type="checkbox" 
                      id="manualIsReset" 
                      checked={manualIsReset} 
                      onChange={e => setManualIsReset(e.target.checked)} 
                    />
                    <label htmlFor="manualIsReset" className="text-xs text-secondary font-medium cursor-pointer">
                      Start a new ₹5,000 monthly cycle
                    </label>
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsManualFormOpen(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="tx-list">
            {transactions.length === 0 ? (
              <div className="card text-center text-secondary py-6">
                <Info size={24} className="margin-auto mb-2 text-muted" style={{ display: 'block', margin: '0 auto 0.5rem auto' }} />
                <p className="text-sm">No transactions yet.</p>
                <p className="text-xs text-muted mt-1">Use the SMS Sandbox to test incoming texts!</p>
              </div>
            ) : (
              transactions.map(tx => {
                const isDebit = tx.type === 'debit';
                const isExcluded = tx.isExcluded;
                const userMapped = isDebit && mappings.some(m => m.upiId.toLowerCase() === tx.merchant.toLowerCase());
                const autoBrandName = isDebit && !userMapped && getAutoBrand(tx.merchant);
                
                const displayName = isDebit ? getMerchantName(tx.merchant) : tx.merchant;
                const badgeText = userMapped ? 'mapped' : (autoBrandName ? 'auto' : null);
                
                return (
                  <div key={tx.id} className="tx-item" style={isExcluded ? { opacity: 0.4 } : undefined}>
                    <div className={`tx-icon-wrapper ${isDebit ? 'tx-icon-debit' : 'tx-icon-credit'}`}>
                      {isDebit ? <TrendingUp size={18} style={{ transform: 'rotate(90deg)' }} /> : <Wallet size={18} />}
                    </div>

                    <div className="tx-details">
                      <div className="flex items-center gap-1.5">
                        <span className="tx-title" style={isExcluded ? { textDecoration: 'line-through' } : undefined}>{displayName}</span>
                        {badgeText && (
                          <span className="text-xs text-muted" style={{ display: 'inline-flex', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                            {badgeText}
                          </span>
                        )}
                        {isExcluded && (
                          <span className="text-xs text-danger" style={{ display: 'inline-flex', padding: '0.1rem 0.3rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>
                            excluded
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs text-secondary mt-0.5">
                        {isDebit ? (
                          <span className="tx-subtitle">UPI: {tx.merchant}</span>
                        ) : (
                          <span className="tx-subtitle text-success">Monthly Credit Line Credit</span>
                        )}
                      </div>
                    </div>

                    <div className="tx-meta">
                      <div className={`tx-amount ${isDebit ? 'text-danger' : 'text-success'}`} style={isExcluded ? { textDecoration: 'line-through' } : undefined}>
                        {isDebit ? '-' : '+'}₹{tx.amount}
                      </div>
                      <div className="tx-date">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        {new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-3" style={{ marginLeft: '0.75rem' }}>
                      <button 
                        className={`btn-icon ${isExcluded ? 'text-success' : 'text-danger'}`} 
                        onClick={() => handleToggleExclude(tx.id)}
                        title={isExcluded ? "Include in budget" : "Exclude from budget"}
                      >
                        {isExcluded ? <CheckCircle2 size={14} /> : <Sliders size={14} />}
                      </button>
                      <button 
                        className="btn-icon danger" 
                        onClick={() => handleDeleteTransaction(tx.id)}
                        title="Delete transaction"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* TAB CONTENT: UPI MAPPINGS */}
      {activeTab === 'mappings' && (
        <section>
          <div className="card">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1">
              <Tag size={16} className="text-primary" /> Create UPI Mapping
            </h3>
            
            <form onSubmit={handleAddMapping} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-secondary font-medium">Merchant UPI ID / Reference Code</label>
                <input 
                  type="text" 
                  placeholder="e.g. 9876543210@paytm or swiggy@upi" 
                  value={newMappingUpi}
                  onChange={e => setNewMappingUpi(e.target.value)}
                  className="input"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-secondary font-medium">Friendly Display Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. My Favorite Grocery Store" 
                  value={newMappingName}
                  onChange={e => setNewMappingName(e.target.value)}
                  className="input"
                />
              </div>

              <button type="submit" className="btn btn-primary w-full mt-1">
                <Plus size={16} /> Add Mapping Rule
              </button>
            </form>
          </div>

          <h3 className="text-sm font-bold mb-3">Active Renaming Rules</h3>
          
          <div className="flex flex-col gap-2">
            {mappings.length === 0 ? (
              <div className="card text-center text-secondary py-4">
                <p className="text-xs">No merchant mappings defined yet.</p>
              </div>
            ) : (
              mappings.map(m => (
                <div key={m.upiId} className="card" style={{ padding: '0.875rem 1rem', marginBottom: '0.5rem' }}>
                  <div className="flex justify-between items-center">
                    {editingMappingUpi === m.upiId ? (
                      <div className="flex flex-col gap-2 w-full mr-2">
                        <span className="text-xs text-muted">Editing for {m.upiId}</span>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={editingMappingName}
                            onChange={e => setEditingMappingName(e.target.value)}
                            className="input inline-edit-input"
                          />
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                            onClick={saveInlineMapping}
                          >
                            Save
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                            onClick={() => setEditingMappingUpi(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="font-semibold text-sm">{m.friendlyName}</div>
                          <div className="text-xs text-secondary">{m.upiId}</div>
                        </div>

                        <div className="flex gap-2">
                          <button 
                            className="btn-icon" 
                            onClick={() => startEditingMapping(m.upiId, m.friendlyName)}
                            title="Edit rule"
                          >
                            <Sliders size={14} />
                          </button>
                          <button 
                            className="btn-icon danger" 
                            onClick={() => deleteMapping(m.upiId)}
                            title="Delete rule"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB CONTENT: SMS SANDBOX (SIMULATION) */}
      {activeTab === 'simulator' && (
        <section>
          <div className="card">
            <div className="card-title text-primary">
              <Smartphone size={16} /> SMS Parser Sandbox
            </div>
            
            <p className="text-xs text-secondary mb-3 leading-relaxed">
              Below, you can paste or simulate any incoming transaction SMS sent by your bank. The client-side parser engine will instantly process the text, extract transaction amounts, credit line signals, and UPI merchants.
            </p>

            <div className="flex flex-col gap-3">
              <textarea 
                className="simulator-textarea" 
                value={simSMS}
                onChange={e => setSimSMS(e.target.value)}
                placeholder="Paste your bank message here..."
              ></textarea>

              <button className="btn btn-primary w-full" onClick={handleSimulateSMS}>
                <Send size={16} /> Parse & Add Transaction
              </button>

              {simulationResult && (
                <div 
                  className="card" 
                  style={{ 
                    padding: '0.75rem', 
                    fontSize: '0.75rem', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderColor: 'rgba(255,255,255,0.06)',
                    marginBottom: 0
                  }}
                >
                  <p className="font-semibold">{simulationResult}</p>
                </div>
              )}
            </div>
          </div>

          <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Try these Templates:</h4>
          
          <div className="flex flex-col gap-2">
            <button 
              className="btn btn-secondary text-xs text-left" 
              style={{ justifyContent: 'flex-start', padding: '0.625rem 0.875rem' }}
              onClick={() => setSimSMS('Your A/c x1234 is debited by Rs.580.00 on 16-07-26. Info: UPI-zomato@upi.')}
            >
              🍕 Zomato Debit (₹580)
            </button>
            <button 
              className="btn btn-secondary text-xs text-left" 
              style={{ justifyContent: 'flex-start', padding: '0.625rem 0.875rem' }}
              onClick={() => setSimSMS('Rs. 1,499.00 debited from account ...1234 on 16-07-26 to UPI Ref valve@axisbank.')}
            >
              🎮 Steam/Valve Debit (₹1,499)
            </button>
            <button 
              className="btn btn-secondary text-xs text-left" 
              style={{ justifyContent: 'flex-start', padding: '0.625rem 0.875rem' }}
              onClick={() => setSimSMS('Your A/c x1234 is debited by Rs.450.00 on 16-07-26. Info: UPI-swiggy@upi.')}
            >
              🍔 Swiggy Debit (₹450)
            </button>
            <button 
              className="btn btn-secondary text-xs text-left" 
              style={{ justifyContent: 'flex-start', padding: '0.625rem 0.875rem' }}
              onClick={() => setSimSMS('Debited: INR 120.00 from A/c XX1234 on 16/07/2026. Ref: 123456')}
            >
              ☕ Cafe Coffee Day (₹120)
            </button>
            <button 
              className="btn btn-secondary text-xs text-left" 
              style={{ justifyContent: 'flex-start', padding: '0.625rem 0.875rem' }}
              onClick={() => setSimSMS('Dear Customer, A/c X1234 has been credited with Rs 5000.00 on 16-07-26 by A/c X5678 (UPI Ref no 123456).')}
            >
              🎉 Credit Line Reset / Credit (₹5,000)
            </button>
          </div>
        </section>
      )}

      {/* TAB CONTENT: SETTINGS */}
      {activeTab === 'settings' && (
        <section className="flex flex-col gap-4">
          <div className="card">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5">
              <Sliders size={16} className="text-primary" /> Credit Line Rules
            </h3>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs text-secondary font-medium">Monthly Credit Base (₹)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  className="input" 
                  style={{ flexGrow: 1 }} 
                  value={creditBase} 
                  onChange={e => handleUpdateCreditBase(parseFloat(e.target.value) || 0)} 
                />
              </div>
              <span className="text-xs text-muted leading-relaxed">
                When a bank credit transaction of this amount (or higher) is parsed, the app automatically resets the monthly baseline balance to this figure.
              </span>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5">
              <Shield size={16} className="text-primary" /> Vercel Dashboard Sync
            </h3>
            
            <p className="text-xs text-secondary mb-3 leading-relaxed">
              Enter your Vercel database Sync Token below. This links your phone's local storage database to your PC dashboard.
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-secondary font-medium">Sync Token</label>
              <input 
                type="password" 
                placeholder="Paste SYNC_TOKEN..." 
                className="input" 
                value={syncToken}
                onChange={e => handleSaveSyncToken(e.target.value)}
              />
              <span className="text-xs text-muted leading-relaxed">
                Matches the `SYNC_TOKEN` environment variable on Vercel to allow encrypted transaction uploading.
              </span>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5">
              <Smartphone size={16} className="text-primary" /> SMS Ingestion Settings
            </h3>
            <p className="text-xs text-secondary mb-3 leading-relaxed">
              Define the boundary cutoff. The app (and adb bridge) will only scan SMS alerts received after this time.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-secondary font-medium">Active Cutoff Date</label>
              <div className="font-semibold text-sm mb-1">
                {smsCutoffTime ? new Date(smsCutoffTime).toLocaleString() : 'All historical messages'}
              </div>
              <div className="flex gap-2">
                <button 
                  className="btn btn-primary text-xs" 
                  onClick={() => {
                    const nowStr = new Date().toISOString();
                    setSmsCutoffTime(nowStr);
                    localStorage.setItem('fm_sms_cutoff_time', nowStr);
                    if (syncToken) {
                      pushToBackend(transactions, mappings, creditBase, syncToken, nowStr);
                    }
                  }}
                >
                  Set Cutoff to NOW
                </button>
                <button 
                  className="btn btn-secondary text-xs" 
                  onClick={() => {
                    setSmsCutoffTime('');
                    localStorage.removeItem('fm_sms_cutoff_time');
                    if (syncToken) {
                      pushToBackend(transactions, mappings, creditBase, syncToken, '');
                    }
                  }}
                >
                  Clear Cutoff (Scan All)
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '0.875rem 1rem' }}>
            <div className="flex items-center gap-2 text-xs text-secondary leading-relaxed">
              <HelpCircle size={16} className="text-primary" style={{ flexShrink: 0 }} />
              <div>
                <strong>Local-First Sandbox Mode:</strong> All data modifications are saved instantly to your mobile browser's local sandbox storage.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Bottom Nav Bar for Mobile UI Frame */}
      <nav className="mobile-nav">
        <button 
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <Wallet />
          <span>Transactions</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'mappings' ? 'active' : ''}`}
          onClick={() => setActiveTab('mappings')}
        >
          <Tag />
          <span>Mappings</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulator')}
        >
          <Smartphone />
          <span>Sandbox</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Sliders />
          <span>Settings</span>
        </button>
      </nav>
    </main>
  );
}
