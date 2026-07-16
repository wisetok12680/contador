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

  // Form Inputs
  const [editingMappingUpi, setEditingMappingUpi] = useState<string | null>(null);
  const [editingMappingName, setEditingMappingName] = useState<string>('');
  
  const [newMappingUpi, setNewMappingUpi] = useState<string>('');
  const [newMappingName, setNewMappingName] = useState<string>('');

  const [simSMS, setSimSMS] = useState<string>(
    'Your A/c x1234 is debited by Rs.250.00 on 16-07-26. Info: UPI-9876543210@paytm.'
  );
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  // Initialize with Mock Data if nothing in localStorage
  useEffect(() => {
    const savedBase = localStorage.getItem('fm_credit_base');
    const savedTx = localStorage.getItem('fm_transactions');
    const savedMappings = localStorage.getItem('fm_mappings');
    const savedToken = localStorage.getItem('fm_sync_token');

    if (savedBase) setCreditBase(parseFloat(savedBase));
    if (savedToken) setSyncToken(savedToken);

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
  }, []);

  // Save to localStorage when state changes
  const updateTransactions = (newTxs: Transaction[]) => {
    setTransactions(newTxs);
    localStorage.setItem('fm_transactions', JSON.stringify(newTxs));
    // Simulate Sync
    triggerSyncMock();
  };

  const updateMappings = (newMaps: UPIMapping[]) => {
    setMappings(newMaps);
    localStorage.setItem('fm_mappings', JSON.stringify(newMaps));
    triggerSyncMock();
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
    // Find index of the latest credit line reset
    const resetIndices = transactions
      .map((tx, idx) => (tx.isCreditLineReset || (tx.type === 'credit' && tx.amount >= creditBase) ? idx : -1))
      .filter(idx => idx !== -1);

    const latestResetIdx = resetIndices.length > 0 ? Math.max(...resetIndices) : -1;
    
    let startingBalance = creditBase;
    let relevantTxs = transactions;

    if (latestResetIdx !== -1) {
      startingBalance = transactions[latestResetIdx].amount;
      // Get all transactions after this reset (since transactions are sorted newest first, these are index 0 to latestResetIdx)
      relevantTxs = transactions.slice(0, latestResetIdx);
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
  const handleDeleteTransaction = (id: string) => {
    const updated = transactions.filter(tx => tx.id !== id);
    updateTransactions(updated);
  };

  const handleUpdateCreditBase = (val: number) => {
    setCreditBase(val);
    localStorage.setItem('fm_credit_base', val.toString());
    triggerSyncMock();
  };

  const handleSaveSyncToken = (val: string) => {
    setSyncToken(val);
    localStorage.setItem('fm_sync_token', val);
    triggerSyncMock();
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
            <h1 className="text-xl font-bold">FlowFinance</h1>
            <p className="text-xs text-muted">Credit Manager</p>
          </div>
        </div>

        <div className="sync-indicator">
          <span className={`sync-dot ${isSynced ? 'active' : 'inactive'}`}></span>
          <span className="text-xs font-medium">{isSynced ? 'Live Synced' : 'Syncing...'}</span>
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
                const userMapped = isDebit && mappings.some(m => m.upiId.toLowerCase() === tx.merchant.toLowerCase());
                const autoBrandName = isDebit && !userMapped && getAutoBrand(tx.merchant);
                
                const displayName = isDebit ? getMerchantName(tx.merchant) : tx.merchant;
                const badgeText = userMapped ? 'mapped' : (autoBrandName ? 'auto' : null);
                
                return (
                  <div key={tx.id} className="tx-item">
                    <div className={`tx-icon-wrapper ${isDebit ? 'tx-icon-debit' : 'tx-icon-credit'}`}>
                      {isDebit ? <TrendingUp size={18} style={{ transform: 'rotate(90deg)' }} /> : <Wallet size={18} />}
                    </div>

                    <div className="tx-details">
                      <div className="flex items-center gap-1.5">
                        <span className="tx-title">{displayName}</span>
                        {badgeText && (
                          <span className="text-xs text-muted" style={{ display: 'inline-flex', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                            {badgeText}
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
                      <div className={`tx-amount ${isDebit ? 'text-danger' : 'text-success'}`}>
                        {isDebit ? '-' : '+'}₹{tx.amount}
                      </div>
                      <div className="tx-date">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        {new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </div>

                    <button 
                      className="btn-icon danger ml-3" 
                      style={{ marginLeft: '0.75rem' }}
                      onClick={() => handleDeleteTransaction(tx.id)}
                      title="Delete transaction"
                    >
                      <Trash2 size={14} />
                    </button>
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
