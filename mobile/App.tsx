import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSMS, getAutoBrand } from './lib/smsParser';

// Safely import native module to prevent crashes in Expo Go or iOS
let SmsAndroid: any = null;
if (Platform.OS === 'android') {
  try {
    const smsModule = require('react-native-get-sms-android');
    SmsAndroid = smsModule.default || smsModule;
  } catch (e) {
    console.log('SmsAndroid is not available. Native SMS features will be mocked.');
  }
}

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

export default function App() {
  // Navigation: 'dashboard' | 'mappings' | 'sandbox' | 'settings'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'mappings' | 'sandbox' | 'settings'>('dashboard');

  // Application State
  const [creditBase, setCreditBase] = useState<number>(5000);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [mappings, setMappings] = useState<UPIMapping[]>([]);
  const [syncToken, setSyncToken] = useState<string>('');
  const [syncUrl, setSyncUrl] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnlineSynced, setIsOnlineSynced] = useState<boolean>(true);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [smsCutoffTime, setSmsCutoffTime] = useState<string>('');

  // Manual transaction inputs
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualType, setManualType] = useState<'debit' | 'credit'>('debit');
  const [manualMerchant, setManualMerchant] = useState<string>('');
  const [manualIsReset, setManualIsReset] = useState<boolean>(false);

  // Form Inputs
  const [newUpi, setNewUpi] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [customSms, setCustomSms] = useState<string>(
    'Your A/c x1234 is debited by Rs.580.00 on 16-07-26. Info: UPI-zomato@upi.'
  );

  // Load state on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const savedBase = await AsyncStorage.getItem('fm_credit_base');
      const savedToken = await AsyncStorage.getItem('fm_sync_token');
      const savedUrl = await AsyncStorage.getItem('fm_sync_url');
      const savedTx = await AsyncStorage.getItem('fm_transactions');
      const savedMappings = await AsyncStorage.getItem('fm_mappings');
      const savedLastSynced = await AsyncStorage.getItem('fm_last_synced_at');
      const savedCutoff = await AsyncStorage.getItem('fm_sms_cutoff_time');

      let currentBase = 5000;
      let currentToken = '';
      let currentUrl = '';
      let currentTxs: Transaction[] = [];
      let currentMaps: UPIMapping[] = [];
      let currentCutoff = '';

      if (savedBase) {
        currentBase = parseFloat(savedBase);
        setCreditBase(currentBase);
      }
      if (savedToken) {
        currentToken = savedToken;
        setSyncToken(currentToken);
      }
      if (savedUrl) {
        currentUrl = savedUrl;
        setSyncUrl(currentUrl);
      }
      if (savedLastSynced) {
        setLastSyncedAt(savedLastSynced);
      }
      if (savedCutoff) {
        currentCutoff = savedCutoff;
        setSmsCutoffTime(currentCutoff);
      } else {
        currentCutoff = new Date().toISOString();
        setSmsCutoffTime(currentCutoff);
        await AsyncStorage.setItem('fm_sms_cutoff_time', currentCutoff);
      }

      if (savedMappings) {
        currentMaps = JSON.parse(savedMappings);
        setMappings(currentMaps);
      } else {
        currentMaps = [
          { upiId: '9876543210@paytm', friendlyName: 'Grocery Shop' },
          { upiId: '123456', friendlyName: 'Cafe Coffee Day' },
          { upiId: 'swiggy@upi', friendlyName: 'Swiggy Food' },
        ];
        setMappings(currentMaps);
        await AsyncStorage.setItem('fm_mappings', JSON.stringify(currentMaps));
      }

      if (savedTx) {
        currentTxs = JSON.parse(savedTx);
        setTransactions(currentTxs);
      } else {
        const now = new Date();
        currentTxs = [
          {
            id: '1',
            amount: 5000,
            type: 'credit',
            merchant: 'Salary / Reset',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 48).toISOString(),
            isCreditLineReset: true,
            raw: 'Dear Customer, A/c X1234 has been credited with Rs 5000.00 on 14-07-26. Credit line started.'
          },
          {
            id: '2',
            amount: 250,
            type: 'debit',
            merchant: '9876543210@paytm',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
            isCreditLineReset: false,
            raw: 'Your A/c x1234 is debited by Rs.250.00 on 15-07-26. Info: UPI-9876543210@paytm.'
          }
        ];
        setTransactions(currentTxs);
        await AsyncStorage.setItem('fm_transactions', JSON.stringify(currentTxs));
      }

      if (currentUrl && currentToken) {
        pullAndMergeFromCloud(currentTxs, currentMaps, currentBase, currentUrl, currentToken, currentCutoff);
      }
    } catch (e) {
      console.log('Failed to load data:', e);
    }
  };

  const saveTransactions = async (newTxs: Transaction[]) => {
    try {
      setTransactions(newTxs);
      await AsyncStorage.setItem('fm_transactions', JSON.stringify(newTxs));
      triggerCloudSync(newTxs, mappings);
    } catch (e) {
      console.log('Failed to save transactions:', e);
    }
  };

  const saveMappings = async (newMaps: UPIMapping[]) => {
    try {
      setMappings(newMaps);
      await AsyncStorage.setItem('fm_mappings', JSON.stringify(newMaps));
      triggerCloudSync(transactions, newMaps);
    } catch (e) {
      console.log('Failed to save mappings:', e);
    }
  };

  // Vercel PC Sync API Communication
  const pushToCloud = async (
    txs: Transaction[],
    maps: UPIMapping[],
    base: number = creditBase,
    url: string = syncUrl,
    token: string = syncToken,
    cutoff: string = smsCutoffTime
  ) => {
    if (!url || !token) return;
    try {
      const response = await fetch(`${url}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transactions: txs,
          mappings: maps,
          creditBase: base,
          lastSync: new Date().toISOString(),
          smsCutoffTime: cutoff
        })
      });

      if (response.ok) {
        setIsOnlineSynced(true);
      } else {
        console.log('Push to cloud failed with response:', response.status);
      }
    } catch (err) {
      console.log('Push to cloud network failed:', err);
    }
  };

  const triggerCloudSync = async (txs: Transaction[], maps: UPIMapping[]) => {
    await pushToCloud(txs, maps, creditBase, syncUrl, syncToken, smsCutoffTime);
  };

  const pullAndMergeFromCloud = async (
    currentTxs: Transaction[],
    currentMaps: UPIMapping[],
    currentBase: number,
    url: string = syncUrl,
    token: string = syncToken,
    currentCutoff: string = smsCutoffTime
  ) => {
    if (!url || !token) return;
    setIsCloudSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch(`${url}/api/sync?token=${token}`);
      if (!response.ok) {
        throw new Error(`Sync server returned status ${response.status}`);
      }
      const data = await response.json();
      
      const remoteTxs = (data.transactions || []) as Transaction[];
      const remoteMaps = (data.mappings || []) as UPIMapping[];
      const remoteBase = data.creditBase !== undefined ? data.creditBase : currentBase;
      const remoteCutoff = data.smsCutoffTime || currentCutoff;

      // Merge transactions by unique ID
      const txMap = new Map<string, Transaction>();
      remoteTxs.forEach(tx => txMap.set(tx.id, tx));
      currentTxs.forEach(tx => txMap.set(tx.id, tx));
      const mergedTxs = Array.from(txMap.values());
      mergedTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Merge mappings by upiId (case-insensitive key)
      const mapMap = new Map<string, UPIMapping>();
      remoteMaps.forEach(m => mapMap.set(m.upiId.toLowerCase(), m));
      currentMaps.forEach(m => mapMap.set(m.upiId.toLowerCase(), m));
      const mergedMaps = Array.from(mapMap.values());

      const mergedBase = remoteBase !== currentBase ? remoteBase : currentBase;

      // Save merged values
      setTransactions(mergedTxs);
      setMappings(mergedMaps);
      setCreditBase(mergedBase);
      setSmsCutoffTime(remoteCutoff);
      
      const now = new Date().toISOString();
      setLastSyncedAt(now);

      await AsyncStorage.setItem('fm_transactions', JSON.stringify(mergedTxs));
      await AsyncStorage.setItem('fm_mappings', JSON.stringify(mergedMaps));
      await AsyncStorage.setItem('fm_credit_base', mergedBase.toString());
      await AsyncStorage.setItem('fm_sms_cutoff_time', remoteCutoff);
      await AsyncStorage.setItem('fm_last_synced_at', now);

      setIsOnlineSynced(true);

      // Push merged back to server
      await pushToCloud(mergedTxs, mergedMaps, mergedBase, url, token, remoteCutoff);
    } catch (err: any) {
      console.log('Bidirectional sync failed:', err);
      setSyncError(err.message || 'Network error');
      setIsOnlineSynced(false);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Query Phone's SMS Database Natively (Android release builds)
  const syncSmsInbox = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Sandbox Only', 'Natively reading SMS inbox is only supported on Android devices.');
      return;
    }

    if (!SmsAndroid) {
      Alert.alert(
        'Expo Go Sandbox Mode',
        'Native SMS access requires an Android APK build (Expo prebuild). Use the SMS Sandbox tab to simulate messages on this client!'
      );
      return;
    }

    // Request permissions dynamically at runtime
    try {
      const { PermissionsAndroid } = require('react-native');
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: 'SMS Permission Required',
          message: "Aarush's Wallet needs access to read your SMS to detect and import your bank transaction alerts.",
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK'
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission Denied', "Aarush's Wallet requires SMS read permission to sync transactions.");
        return;
      }
    } catch (err) {
      console.warn('Failed to request SMS permission:', err);
      return;
    }

    setIsSyncing(true);
    const filter = {
      box: 'inbox' as const,
      maxCount: 500
    };

    SmsAndroid.list(
      JSON.stringify(filter),
      (fail: string) => {
        setIsSyncing(false);
        Alert.alert('Permission Error', 'Failed to read SMS. Please ensure SMS permission is granted.');
      },
      (count: number, smsList: string) => {
        setIsSyncing(false);
        try {
          const rawMsgs = JSON.parse(smsList);
          processIncomingSmsList(rawMsgs);
        } catch (err) {
          Alert.alert('Parsing Error', 'Failed to read messages.');
        }
      }
    );
  };

  // Parse SMS list and add new ones
  const processIncomingSmsList = (rawMsgs: any[]) => {
    let newTransactionsAdded = 0;
    let tempTxs = [...transactions];

    // Sort raw messages by date descending (newest first) to ensure chronological scanning
    const sortedRawMsgs = [...rawMsgs].sort((a, b) => b.date - a.date);
    const cutoffDate = smsCutoffTime ? new Date(smsCutoffTime) : new Date(0);

    for (const msg of sortedRawMsgs) {
      const smsDate = new Date(msg.date);
      // Skip if SMS is older than cutoff time
      if (smsDate.getTime() < cutoffDate.getTime()) {
        continue;
      }

      const body = msg.body;
      const parsed = parseSMS(body);

      if (parsed) {
        // Use message timestamp
        const smsTime = smsDate.toISOString();
        
        // Check for duplicates based on content + timestamp matches
        const exists = tempTxs.some(
          (tx) => tx.amount === parsed.amount && tx.raw === parsed.raw
        );

        if (!exists) {
          const newTx: Transaction = {
            id: msg._id ? msg._id.toString() : Date.now().toString() + Math.random(),
            amount: parsed.amount,
            type: parsed.type,
            merchant: parsed.merchant,
            timestamp: smsTime,
            isCreditLineReset: parsed.isCreditLineReset || (parsed.type === 'credit' && parsed.amount >= creditBase),
            raw: parsed.raw
          };
          tempTxs.push(newTx);
          newTransactionsAdded++;
        }

        // If we hit a deposit that resets the credit line (type credit and amount >= creditBase),
        // we stop scanning older SMS alerts.
        if (parsed.isCreditLineReset || (parsed.type === 'credit' && parsed.amount >= creditBase)) {
          console.log(`Found latest credit line reset deposit of ₹${parsed.amount}. Stopping SMS ingestion.`);
          break;
        }
      }
    }

    if (newTransactionsAdded > 0) {
      // Sort newest first
      tempTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      saveTransactions(tempTxs);
      Alert.alert('Sync Successful', `Extracted ${newTransactionsAdded} new bank transaction(s).`);
    } else {
      Alert.alert('Synced', 'Your credit line is up to date. No new bank messages found.');
    }
  };

  // Calculations
  const getCreditLineStatus = () => {
    // Filter active transactions
    const activeTxs = transactions.filter(tx => !tx.isExcluded);

    const resetIndices = activeTxs
      .map((tx, idx) => (tx.isCreditLineReset || (tx.type === 'credit' && tx.amount >= creditBase) ? idx : -1))
      .filter(idx => idx !== -1);

    const latestResetIdx = resetIndices.length > 0 ? Math.max(...resetIndices) : -1;
    
    let startingBalance = creditBase;
    let relevantTxs = activeTxs;

    if (latestResetIdx !== -1) {
      startingBalance = creditBase;
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

  // Helper displays
  const getMerchantName = (upiId: string) => {
    const found = mappings.find(m => m.upiId.toLowerCase() === upiId.toLowerCase());
    if (found) return found.friendlyName;
    const autoBrand = getAutoBrand(upiId);
    if (autoBrand) return autoBrand;
    return upiId;
  };

  const handleToggleExclude = (id: string) => {
    const updated = transactions.map(tx => 
      tx.id === id ? { ...tx, isExcluded: !tx.isExcluded } : tx
    );
    saveTransactions(updated);
  };

  const handleSaveManualTransaction = () => {
    const amt = parseFloat(manualAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }
    if (!manualMerchant.trim()) {
      Alert.alert('Error', 'Please enter a description/merchant.');
      return;
    }

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
    saveTransactions(updated);

    // Reset states
    setManualAmount('');
    setManualMerchant('');
    setManualType('debit');
    setManualIsReset(false);
    setIsManualModalOpen(false);
  };

  // Actions
  const handleDeleteTx = (id: string) => {
    Alert.alert(
      'Remove Transaction',
      'Are you sure you want to delete this transaction from your credit feed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            const updated = transactions.filter(tx => tx.id !== id);
            saveTransactions(updated);
          }
        }
      ]
    );
  };

  const handleSimulateSMS = () => {
    const parsed = parseSMS(customSms);
    if (!parsed) {
      Alert.alert('Ignored', 'Not a recognized credit/debit transactional bank SMS.');
      return;
    }

    const newTx: Transaction = {
      id: Date.now().toString(),
      amount: parsed.amount,
      type: parsed.type,
      merchant: parsed.merchant,
      timestamp: new Date().toISOString(),
      isCreditLineReset: parsed.isCreditLineReset,
      raw: parsed.raw
    };

    const updated = [newTx, ...transactions];
    saveTransactions(updated);
    
    Alert.alert(
      'Mock Success',
      `Parsed ${parsed.type.toUpperCase()} of ₹${parsed.amount} from "${parsed.merchant}".`
    );
  };

  const handleAddMapping = () => {
    if (!newUpi || !newName) {
      Alert.alert('Error', 'Please enter both the UPI ID and a display name.');
      return;
    }

    const exists = mappings.some(m => m.upiId.toLowerCase() === newUpi.toLowerCase());
    if (exists) {
      Alert.alert('Error', 'This UPI ID is already mapped.');
      return;
    }

    const updated = [...mappings, { upiId: newUpi, friendlyName: newName }];
    saveMappings(updated);
    setNewUpi('');
    setNewName('');
  };

  const deleteMapping = (upiId: string) => {
    const updated = mappings.filter(m => m.upiId !== upiId);
    saveMappings(updated);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Aarush's Wallet</Text>
          <Text style={styles.headerSubtitle}>Native Mobile Client</Text>
        </View>
      </View>

      {/* Main Credit Progress Card */}
      <View style={styles.dashboardCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Remaining Credit Line</Text>
          <Text style={styles.cardBaseBadge}>Limit: ₹{startingBalance}</Text>
        </View>

        <Text style={styles.cardBalance}>₹{remainingBalance.toLocaleString('en-IN')}</Text>
        
        <View style={styles.progressContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${progressPercent}%` },
              remainingBalance < startingBalance * 0.2 ? styles.progressBarDanger : null
            ]} 
          />
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>Total Spent: ₹{totalDebits}</Text>
          <Text style={styles.cardMetaText}>{progressPercent.toFixed(0)}% Left</Text>
        </View>
      </View>

      {/* TAB CONTENT SCROLLVIEW */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* TAB 1: DASHBOARD FEED */}
        {activeTab === 'dashboard' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Transactions Feed</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.addManualBtn} onPress={() => setIsManualModalOpen(!isManualModalOpen)}>
                  <Text style={styles.syncBtnText}>{isManualModalOpen ? 'Close' : '+ Add'}</Text>
                </TouchableOpacity>
                {Platform.OS === 'android' && (
                  <TouchableOpacity style={styles.syncBtn} onPress={syncSmsInbox} disabled={isSyncing}>
                    {isSyncing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.syncBtnText}>Sync Inbox</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isManualModalOpen && (
              <View style={[styles.formCard, { marginBottom: 15 }]}>
                <Text style={styles.formTitle}>Add Manual Transaction</Text>
                
                <TextInput 
                  style={styles.input}
                  placeholder="Amount (₹)"
                  placeholderTextColor="#6b7280"
                  keyboardType="numeric"
                  value={manualAmount}
                  onChangeText={setManualAmount}
                />

                <TextInput 
                  style={styles.input}
                  placeholder="Merchant / Description (e.g. Grocery)"
                  placeholderTextColor="#6b7280"
                  value={manualMerchant}
                  onChangeText={setManualMerchant}
                />

                <Text style={styles.settingLabel}>Type</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <TouchableOpacity 
                    style={[styles.typeSelectBtn, manualType === 'debit' ? styles.typeSelectBtnActive : null]}
                    onPress={() => setManualType('debit')}
                  >
                    <Text style={[styles.typeSelectBtnText, manualType === 'debit' ? styles.typeSelectBtnTextActive : null]}>Debit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.typeSelectBtn, manualType === 'credit' ? styles.typeSelectBtnActive : null]}
                    onPress={() => setManualType('credit')}
                  >
                    <Text style={[styles.typeSelectBtnText, manualType === 'credit' ? styles.typeSelectBtnTextActive : null]}>Credit</Text>
                  </TouchableOpacity>
                </View>

                {manualType === 'credit' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 }}>
                    <TouchableOpacity 
                      style={[styles.checkbox, manualIsReset ? styles.checkboxChecked : null]}
                      onPress={() => setManualIsReset(!manualIsReset)}
                    >
                      {manualIsReset && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✓</Text>}
                    </TouchableOpacity>
                    <Text style={{ color: '#9ca3af', fontSize: 12 }}>Start new ₹5,000 monthly cycle</Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={handleSaveManualTransaction}>
                    <Text style={styles.btnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.btnSecondary, { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0 }]} 
                    onPress={() => setIsManualModalOpen(false)}
                  >
                    <Text style={[styles.btnText, { color: '#9ca3af' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {transactions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No transactions recorded.</Text>
                <Text style={styles.emptySubText}>Use Sandbox tab to simulate transactions!</Text>
              </View>
            ) : (
              transactions.map(tx => {
                const isDebit = tx.type === 'debit';
                const isExcluded = tx.isExcluded;
                const userMapped = isDebit && mappings.some(m => m.upiId.toLowerCase() === tx.merchant.toLowerCase());
                const autoBrandName = isDebit && !userMapped && getAutoBrand(tx.merchant);
                
                const displayName = isDebit ? getMerchantName(tx.merchant) : tx.merchant;
                const badgeText = userMapped ? 'mapped' : (autoBrandName ? 'auto' : null);

                return (
                  <View key={tx.id} style={[styles.txItem, isExcluded ? { opacity: 0.4 } : null]}>
                    <View style={[styles.txIndicator, isDebit ? styles.txDebit : styles.txCredit]} />
                    <View style={styles.txMain}>
                      <View style={styles.txTitleRow}>
                        <Text style={[styles.txTitle, isExcluded ? { textDecorationLine: 'line-through' } : null]} numberOfLines={1}>{displayName}</Text>
                        {badgeText && (
                          <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>{badgeText}</Text>
                          </View>
                        )}
                        {isExcluded && (
                          <View style={[styles.badgeContainer, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                            <Text style={[styles.badgeText, { color: '#ef4444' }]}>excluded</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.txSubtitle} numberOfLines={1}>
                        {isDebit ? `UPI: ${tx.merchant}` : 'Monthly Starting Reset'}
                      </Text>
                    </View>
                    <View style={styles.txMeta}>
                      <Text style={[styles.txAmount, isDebit ? styles.amountDebit : styles.amountCredit, isExcluded ? { textDecorationLine: 'line-through' } : null]}>
                        {isDebit ? '-' : '+'}₹{tx.amount}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <TouchableOpacity onPress={() => handleToggleExclude(tx.id)}>
                          <Text style={[styles.txActionText, isExcluded ? styles.txActionInclude : styles.txActionExclude]}>
                            {isExcluded ? 'Include' : 'Exclude'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteTx(tx.id)}>
                          <Text style={styles.txDeleteText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: UPI MAPPINGS */}
        {activeTab === 'mappings' && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>New Renaming Rule</Text>
              <TextInput 
                style={styles.input}
                placeholder="UPI ID (e.g. merchant@upi)"
                placeholderTextColor="#6b7280"
                value={newUpi}
                onChangeText={setNewUpi}
                autoCapitalize="none"
              />
              <TextInput 
                style={styles.input}
                placeholder="Display Name (e.g. Grocery Shop)"
                placeholderTextColor="#6b7280"
                value={newName}
                onChangeText={setNewName}
              />
              <TouchableOpacity style={styles.btnPrimary} onPress={handleAddMapping}>
                <Text style={styles.btnText}>Create Mapping Rule</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Renaming List</Text>
            {mappings.map(m => (
              <View key={m.upiId} style={styles.mappingItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mappingName}>{m.friendlyName}</Text>
                  <Text style={styles.mappingUpi}>{m.upiId}</Text>
                </View>
                <TouchableOpacity style={styles.btnDeleteRule} onPress={() => deleteMapping(m.upiId)}>
                  <Text style={styles.btnDeleteRuleText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* TAB 3: SMS SANDBOX */}
        {activeTab === 'sandbox' && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Local SMS Simulator</Text>
              <Text style={styles.sandboxHelp}>
                Test out the regex parser by submitting a mock bank transaction message below:
              </Text>
              <TextInput 
                style={[styles.input, styles.textarea]}
                multiline
                numberOfLines={3}
                value={customSms}
                onChangeText={setCustomSms}
                placeholder="Paste mock SMS here..."
                placeholderTextColor="#6b7280"
              />
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSimulateSMS}>
                <Text style={styles.btnText}>Parse & Ingest SMS</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Sandbox Templates</Text>
            <TouchableOpacity 
              style={styles.templateBtn}
              onPress={() => setCustomSms('Your A/c x1234 is debited by Rs.580.00 on 16-07-26. Info: UPI-zomato@upi.')}
            >
              <Text style={styles.templateText}>🍕 Zomato Debit (₹580)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.templateBtn}
              onPress={() => setCustomSms('Rs. 1,499.00 debited from account ...1234 on 16-07-26 to UPI Ref valve@axisbank.')}
            >
              <Text style={styles.templateText}>🎮 Steam/Valve Debit (₹1,499)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.templateBtn}
              onPress={() => setCustomSms('Dear Customer, A/c X1234 has been credited with Rs 5000.00 on 16-07-26 by A/c X5678 (UPI Ref no 123456).')}
            >
              <Text style={styles.templateText}>🎉 Credit Line Reset / Credit (₹5,000)</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'settings' && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Vercel Sync Configurations</Text>
              
              <Text style={styles.settingLabel}>PC Dashboard URL</Text>
              <TextInput 
                style={styles.input}
                value={syncUrl}
                onChangeText={async (val) => {
                  setSyncUrl(val);
                  await AsyncStorage.setItem('fm_sync_url', val);
                }}
                placeholder="e.g. https://my-finance.vercel.app"
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
              />

              <Text style={styles.settingLabel}>Security Sync Token</Text>
              <TextInput 
                style={styles.input}
                secureTextEntry
                value={syncToken}
                onChangeText={async (val) => {
                  setSyncToken(val);
                  await AsyncStorage.setItem('fm_sync_token', val);
                }}
                placeholder="Password token matching Vercel env"
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
              />

              {syncError && (
                <Text style={styles.syncErrorText}>{syncError}</Text>
              )}
              {lastSyncedAt && (
                <Text style={styles.syncSuccessText}>
                  Last synced: {new Date(lastSyncedAt).toLocaleString()}
                </Text>
              )}

              <TouchableOpacity 
                style={[styles.btnPrimary, { marginTop: 5 }]} 
                onPress={() => pullAndMergeFromCloud(transactions, mappings, creditBase)}
                disabled={isCloudSyncing}
              >
                {isCloudSyncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Sync Now (Bidirectional)</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Rules Settings</Text>
              <Text style={styles.settingLabel}>Credit Base Limit (₹)</Text>
              <TextInput 
                style={styles.input}
                keyboardType="numeric"
                value={creditBase.toString()}
                onChangeText={async (val) => {
                  const num = parseFloat(val) || 0;
                  setCreditBase(num);
                  await AsyncStorage.setItem('fm_credit_base', num.toString());
                }}
              />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>SMS Ingestion Settings</Text>
              <Text style={styles.settingLabel}>Only scan SMS alerts received after:</Text>
              <Text style={{ color: '#fff', fontSize: 13, marginBottom: 12, fontWeight: '600' }}>
                {smsCutoffTime ? new Date(smsCutoffTime).toLocaleString() : 'All historical messages'}
              </Text>
              
              <TouchableOpacity 
                style={[styles.btnPrimary, { marginBottom: 8 }]} 
                onPress={async () => {
                  const now = new Date().toISOString();
                  setSmsCutoffTime(now);
                  await AsyncStorage.setItem('fm_sms_cutoff_time', now);
                  Alert.alert('Cutoff Updated', 'The app will now only scan messages received from this moment onward.');
                  if (syncToken) {
                    pushToCloud(transactions, mappings, creditBase, syncUrl, syncToken, now);
                  }
                }}
              >
                <Text style={styles.btnText}>Set Cutoff to NOW</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.btnSecondary, { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0 }]} 
                onPress={async () => {
                  setSmsCutoffTime('');
                  await AsyncStorage.removeItem('fm_sms_cutoff_time');
                  Alert.alert('Cutoff Cleared', 'The app will scan your entire message history.');
                  if (syncToken) {
                    pushToCloud(transactions, mappings, creditBase, syncUrl, syncToken, '');
                  }
                }}
              >
                <Text style={[styles.btnText, { color: '#9ca3af' }]}>Clear Cutoff (Scan All)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <View style={styles.footerNav}>
        <TouchableOpacity 
          style={[styles.footerItem, activeTab === 'dashboard' ? styles.footerItemActive : null]}
          onPress={() => setActiveTab('dashboard')}
        >
          <Text style={[styles.footerText, activeTab === 'dashboard' ? styles.footerTextActive : null]}>Feed</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.footerItem, activeTab === 'mappings' ? styles.footerItemActive : null]}
          onPress={() => setActiveTab('mappings')}
        >
          <Text style={[styles.footerText, activeTab === 'mappings' ? styles.footerTextActive : null]}>Rules</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.footerItem, activeTab === 'sandbox' ? styles.footerItemActive : null]}
          onPress={() => setActiveTab('sandbox')}
        >
          <Text style={[styles.footerText, activeTab === 'sandbox' ? styles.footerTextActive : null]}>Sandbox</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.footerItem, activeTab === 'settings' ? styles.footerItemActive : null]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.footerText, activeTab === 'settings' ? styles.footerTextActive : null]}>Sync</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6
  },
  syncDotActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowRadius: 4,
    shadowOpacity: 0.5
  },
  syncDotInactive: {
    backgroundColor: '#6b7280'
  },
  syncText: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '600'
  },
  dashboardCard: {
    margin: 15,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  cardBaseBadge: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  cardBalance: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    marginVertical: 10
  },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 3
  },
  progressBarDanger: {
    backgroundColor: '#8e8e93'
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },
  cardMetaText: {
    fontSize: 11,
    color: '#6b7280'
  },
  scrollContent: {
    paddingHorizontal: 15,
    paddingBottom: 80
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginVertical: 10
  },
  syncBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  emptyCard: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)'
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600'
  },
  emptySubText: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 4
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8
  },
  txIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 10
  },
  txDebit: {
    backgroundColor: '#3a3a3c'
  },
  txCredit: {
    backgroundColor: '#ffffff'
  },
  txMain: {
    flex: 1,
  },
  txTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    maxWidth: '70%'
  },
  badgeContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeText: {
    fontSize: 8,
    color: '#9ca3af',
    fontWeight: '500'
  },
  txSubtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2
  },
  txMeta: {
    alignItems: 'flex-end',
    marginLeft: 10
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '700'
  },
  amountDebit: {
    color: '#8e8e93'
  },
  amountCredit: {
    color: '#ffffff'
  },
  txDelete: {
    marginTop: 4
  },
  txDeleteText: {
    fontSize: 10,
    color: '#6b7280',
    textDecorationLine: 'underline'
  },
  formCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    color: '#ffffff',
    padding: 10,
    fontSize: 13,
    marginBottom: 10
  },
  textarea: {
    height: 70,
    textAlignVertical: 'top'
  },
  btnPrimary: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSecondary: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700'
  },
  mappingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 6
  },
  mappingName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff'
  },
  mappingUpi: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2
  },
  btnDeleteRule: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  btnDeleteRuleText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600'
  },
  sandboxHelp: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 10,
    lineHeight: 16
  },
  templateBtn: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6
  },
  templateText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500'
  },
  settingLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '600',
    marginBottom: 6
  },
  syncErrorText: {
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center'
  },
  syncSuccessText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 8,
    textAlign: 'center'
  },
  addManualBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  txActionText: {
    fontSize: 10,
    textDecorationLine: 'underline',
  },
  txActionInclude: {
    color: '#ffffff'
  },
  txActionExclude: {
    color: '#8e8e93'
  },
  typeSelectBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  typeSelectBtnActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  typeSelectBtnText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  typeSelectBtnTextActive: {
    color: '#000000',
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  checkboxChecked: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  footerNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 10 : 0
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%'
  },
  footerItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#ffffff'
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af'
  },
  footerTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  }
});
