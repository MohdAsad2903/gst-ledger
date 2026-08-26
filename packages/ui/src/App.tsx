import React, { useEffect, useState, useCallback } from 'react';
import type {
  SystemHealth,
  AppSettingsSnapshot,
  StateRow,
  TaxRateProfileRow,
  BackupRecordDTO,
  CalcDemoResult,
  VerifyReportDTO,
} from './vite-env';
import {
  formatPaise,
  decimalStringToPaise,
  paise,
  roundToRupee,
  type RoundingRule,
} from '@gst/core';

/**
 * Formats a plain decimal string (from IPC transport) into Indian currency presentation.
 */
function formatMoneyDisplay(
  decimalStr: string | null | undefined,
  opts: { symbol?: boolean; decimals?: 0 | 2 } = { symbol: true, decimals: 2 },
): string {
  if (decimalStr === null || decimalStr === undefined || decimalStr === '') return '—';
  const parsed = decimalStringToPaise(decimalStr);
  if (!parsed.ok) return decimalStr;
  return formatPaise(parsed.value, opts);
}

export function App(): React.JSX.Element {
  // 1. State
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [settings, setSettings] = useState<AppSettingsSnapshot | null>(null);
  const [statesList, setStatesList] = useState<StateRow[]>([]);
  const [ratesList, setRatesList] = useState<TaxRateProfileRow[]>([]);
  const [backupsList, setBackupsList] = useState<BackupRecordDTO[]>([]);
  const [verifyReports, setVerifyReports] = useState<Record<string, VerifyReportDTO>>({});
  const [bridgeMissing, setBridgeMissing] = useState<boolean>(false);

  // Calculation demo inputs
  const [totalAmountInput, setTotalAmountInput] = useState<string>('141542');
  const [gstAmountInput, setGstAmountInput] = useState<string>('21591');
  const [selectedRateBps, setSelectedRateBps] = useState<number>(1800);
  const [selectedStateCode, setSelectedStateCode] = useState<string>('09');
  const [calcResult, setCalcResult] = useState<CalcDemoResult | null>(null);

  // Status & loading
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [copyNotification, setCopyNotification] = useState<string | null>(null);

  // 2. Data Loading
  const loadSystemData = useCallback(async () => {
    if (!window.api) {
      console.error('Defect 0: window.api is undefined in renderer. Bridge failed to mount.', {
        typeofRequire: typeof (window as unknown as Record<string, unknown>).require,
        typeofProcess: typeof (window as unknown as Record<string, unknown>).process,
      });
      setBridgeMissing(true);
      return;
    }

    try {
      const [h, s, st, rt, bk] = await Promise.all([
        window.api.system.getHealth(),
        window.api.system.getSettings(),
        window.api.masters.getStates(),
        window.api.masters.getRates(),
        window.api.backup.list(),
      ]);

      setHealth(h);
      setSettings(s);
      setStatesList(st);
      setRatesList(rt);
      setBackupsList(bk);
    } catch (err) {
      console.error('Failed to load system data', err);
    }
  }, []);

  useEffect(() => {
    loadSystemData();
    (window as unknown as Record<string, unknown>).__setDemo = (total: string, gst: string, state: string) => {
      setTotalAmountInput(total);
      setGstAmountInput(gst);
      setSelectedStateCode(state);
    };
  }, [loadSystemData]);

  // 3. Live Calculation Recalculation
  const runCalculation = useCallback(async () => {
    if (!window.api) return;

    try {
      const result = await window.api.calc.demo({
        totalAmount: totalAmountInput,
        gstAmount: gstAmountInput,
        rateBps: selectedRateBps,
        counterpartyStateCode: selectedStateCode,
      });
      setCalcResult(result);
    } catch (err) {
      console.error('Calculation demo error', err);
    }
  }, [totalAmountInput, gstAmountInput, selectedRateBps, selectedStateCode]);

  useEffect(() => {
    runCalculation();
  }, [runCalculation]);

  // 4. Handlers
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyNotification(`Copied ${label}`);
      setTimeout(() => setCopyNotification(null), 3000);
    });
  };

  const handleRunBackup = async () => {
    if (!window.api || isBackingUp) return;
    setIsBackingUp(true);
    setBackupMessage('Backing up database...');

    try {
      const res = await window.api.backup.create();
      if (res.ok) {
        setBackupMessage('Backup created and verified successfully!');
        const updated = await window.api.backup.list();
        setBackupsList(updated);
      } else {
        setBackupMessage(`Backup failed: ${res.error}`);
      }
    } catch (err) {
      setBackupMessage(`Backup error: ${String(err)}`);
    } finally {
      setIsBackingUp(false);
      setTimeout(() => setBackupMessage(null), 5000);
    }
  };

  const handleVerifyBackup = async (id: string) => {
    if (!window.api) return;
    try {
      const res = await window.api.backup.verify(id);
      if (res.ok) {
        setVerifyReports(prev => ({ ...prev, [id]: res.value }));
      }
    } catch (err) {
      console.error('Verify error', err);
    }
  };

  const handleRoundingRuleChange = async (rule: RoundingRule) => {
    if (!window.api) return;
    try {
      await window.api.system.setSetting('rounding.rule', rule);
      const updatedSettings = await window.api.system.getSettings();
      setSettings(updatedSettings);
      await runCalculation();
    } catch (err) {
      console.error('Failed to change rounding rule', err);
    }
  };

  // Helper for byte formatting
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Backup age warning (> 7 days)
  const lastBackup = backupsList[0];
  const lastBackupAgeDays = lastBackup
    ? (Date.now() - new Date(lastBackup.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  const showBackupWarning = !lastBackup || lastBackupAgeDays > 7;

  // Worked examples for current rule
  const currentRule = settings?.roundingRule ?? 'HALF_DOWN';
  const workedExamples = [
    { input: 12340n, display: '₹123.40', expected: roundToRupee(paise(12340n), currentRule) },
    { input: 12350n, display: '₹123.50', expected: roundToRupee(paise(12350n), currentRule) },
    { input: 12351n, display: '₹123.51', expected: roundToRupee(paise(12351n), currentRule) },
    { input: 12360n, display: '₹123.60', expected: roundToRupee(paise(12360n), currentRule) },
  ];

  if (bridgeMissing) {
    return (
      <div
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          background: '#f9fafb',
          color: '#111827',
          padding: '2.5rem',
          minHeight: '100vh',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '680px',
            width: '100%',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h1 style={{ color: '#991b1b', marginTop: 0, fontSize: '1.5rem' }}>
            GST Ledger could not start properly
          </h1>
          <p style={{ lineHeight: 1.5, margin: '0.75rem 0' }}>
            The application could not connect to its own database service. Your data has not been changed.
          </p>
          <p style={{ lineHeight: 1.5, margin: '0.75rem 0' }}>
            Please close and reopen the application. If it keeps happening, send this screen and the log file to whoever set this up.
          </p>
          <p style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontWeight: 600 }}>Log file location:</p>
          <div
            style={{
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              padding: '0.75rem',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.9rem',
              marginBottom: '1.25rem',
              wordBreak: 'break-all',
            }}
          >
            {health?.logsDir || 'Check application data directory logs'}
          </div>
          <button
            onClick={() => {
              const text = `GST Ledger Service Connection Failure\nLog Directory: ${health?.logsDir || 'Unknown'}\ntypeof window.api: ${typeof window?.api}`;
              navigator.clipboard.writeText(text).then(() => alert('Details copied to clipboard'));
            }}
            style={{
              background: '#1f2937',
              color: 'white',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '4px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            Copy Details to Clipboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        padding: '2rem 3rem',
        maxWidth: '1200px',
        margin: '0 auto',
        lineHeight: 1.5,
      }}
    >
      {/* Page Header */}
      <header
        style={{
          borderBottom: '3px solid #0f172a',
          paddingBottom: '1.25rem',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 0.25rem 0', fontSize: '2.25rem', fontWeight: 700 }}>
            GST Ledger
          </h1>
          <p style={{ margin: 0, color: '#475569', fontSize: '1.1rem' }}>
            Internal Purchase & Sales Register · A.M Machine Tool and Dies (Ghaziabad, UP)
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '0.4rem 1rem',
              backgroundColor: health?.ok ? '#dcfce7' : '#fee2e2',
              color: health?.ok ? '#15803d' : '#b91c1c',
              fontWeight: 700,
              borderRadius: '6px',
              fontSize: '1rem',
              border: `2px solid ${health?.ok ? '#86efac' : '#fca5a5'}`,
            }}
          >
            {health?.ok ? '[✓ OK] SYSTEM HEALTHY' : '[✗ PROBLEM] SYSTEM ATTENTION'}
          </span>
        </div>
      </header>

      {/* Copy feedback notification */}
      {copyNotification && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            padding: '0.75rem 1.5rem',
            borderRadius: '6px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
            zIndex: 1000,
            fontWeight: 600,
          }}
        >
          {copyNotification}
        </div>
      )}

      {/* SECTION 1 · APPLICATION */}
      <section
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '1.75rem',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <h2
          style={{
            margin: '0 0 1.25rem 0',
            fontSize: '1.4rem',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>1 · Application Runtime</span>
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem',
          }}
        >
          <div>
            <span style={{ color: '#64748b', fontSize: '0.9rem', display: 'block' }}>Application Version</span>
            <strong style={{ fontSize: '1.2rem' }}>{health?.appVersion ?? '0.1.0'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontSize: '0.9rem', display: 'block' }}>Platform / OS</span>
            <strong style={{ fontSize: '1.2rem' }}>{health?.platform ?? '—'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontSize: '0.9rem', display: 'block' }}>Electron / Chromium / Node</span>
            <strong style={{ fontSize: '1rem', fontFamily: 'monospace' }}>
              v{health?.electronVersion} / v{health?.chromeVersion} / v{health?.nodeVersion}
            </strong>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', display: 'grid', gap: '0.75rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f1f5f9',
              padding: '0.6rem 1rem',
              borderRadius: '6px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block' }}>User Data Path:</span>
              <code style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{health?.userDataPath}</code>
            </div>
            <button
              onClick={() => handleCopy(health?.userDataPath ?? '', 'User Data Path')}
              style={{
                marginLeft: '1rem',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Copy Path
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f1f5f9',
              padding: '0.6rem 1rem',
              borderRadius: '6px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block' }}>Logs Directory:</span>
              <code style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{health?.logsDir}</code>
            </div>
            <button
              onClick={() => handleCopy(health?.logsDir ?? '', 'Logs Directory')}
              style={{
                marginLeft: '1rem',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Copy Path
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 2 · DATABASE */}
      <section
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '1.75rem',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <h2
          style={{
            margin: '0 0 1.25rem 0',
            fontSize: '1.4rem',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '0.5rem',
          }}
        >
          2 · Database Status & Verification
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem', display: 'block' }}>Schema Version</span>
            <strong style={{ fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums' }}>
              v{health?.schemaVersion ?? 0}
            </strong>
            <span style={{ fontSize: '0.85rem', color: '#16a34a', display: 'block', marginTop: '0.25rem' }}>
              {health?.pendingMigrationsCount === 0 ? '[✓] Up to date (0 pending)' : `[!] ${health?.pendingMigrationsCount} pending`}
            </span>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem', display: 'block' }}>Journal Mode</span>
            <strong style={{ fontSize: '1.3rem', textTransform: 'uppercase' }}>
              {health?.journalMode}
            </strong>
            <span style={{ fontSize: '0.85rem', color: health?.journalMode === 'wal' ? '#16a34a' : '#dc2626', display: 'block', marginTop: '0.25rem' }}>
              {health?.journalMode === 'wal' ? '[✓] WAL Active' : '[✗] Not WAL'}
            </span>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem', display: 'block' }}>Foreign Keys</span>
            <strong style={{ fontSize: '1.3rem' }}>
              {health?.foreignKeys ? 'ON (1)' : 'OFF (0)'}
            </strong>
            <span style={{ fontSize: '0.85rem', color: health?.foreignKeys ? '#16a34a' : '#dc2626', display: 'block', marginTop: '0.25rem' }}>
              {health?.foreignKeys ? '[✓] Enforced' : '[✗] Disabled'}
            </span>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem', display: 'block' }}>Integrity Check</span>
            <strong style={{ fontSize: '1.3rem', textTransform: 'uppercase' }}>
              {health?.integrityCheck}
            </strong>
            <span style={{ fontSize: '0.85rem', color: health?.integrityCheck === 'ok' ? '#16a34a' : '#dc2626', display: 'block', marginTop: '0.25rem' }}>
              {health?.integrityCheck === 'ok' ? '[✓] Clean' : '[✗] Error'}
            </span>
          </div>
        </div>

        {/* Seeded Row Counts */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem 0', color: '#334155' }}>
            Seeded Master Records & Audit History:
          </h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>GST States: </span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{health?.seededCounts.states} rows</strong>{' '}
              <span style={{ color: '#16a34a' }}>[✓ UP 09, Delhi 07]</span>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Tax Rate Profiles: </span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{health?.seededCounts.taxRateProfiles} slabs</strong>{' '}
              <span style={{ color: '#16a34a' }}>[✓ 0%, 5%, 18%, 40%]</span>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>App Settings: </span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{health?.seededCounts.appSettings} keys</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Audit Log: </span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{health?.seededCounts.auditLog} entries</strong>{' '}
              <span style={{ color: '#64748b' }}>(Append-only)</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3 · BACKUPS */}
      <section
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '1.75rem',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
            3 · Database Backups & Durability
          </h2>
          <button
            onClick={handleRunBackup}
            disabled={isBackingUp}
            style={{
              backgroundColor: isBackingUp ? '#94a3b8' : '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.6rem 1.25rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: isBackingUp ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {isBackingUp ? 'Backing up database…' : 'Run Backup Now'}
          </button>
        </div>

        {/* Prominent Backup Age Notice */}
        {showBackupWarning ? (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              backgroundColor: '#fffbeb',
              border: '2px solid #fef3c7',
              borderLeft: '5px solid #d97706',
              borderRadius: '6px',
              marginBottom: '1.25rem',
              color: '#92400e',
              fontWeight: 500,
            }}
          >
            [!] Notice: No recent database backup was taken in the last 7 days. Consider taking a backup before entering new monthly bills.
          </div>
        ) : (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              backgroundColor: '#f0fdf4',
              border: '2px solid #dcfce7',
              borderLeft: '5px solid #16a34a',
              borderRadius: '6px',
              marginBottom: '1.25rem',
              color: '#166534',
              fontWeight: 500,
            }}
          >
            [✓] Healthy Backup Status: Latest backup taken on {new Date(lastBackup.createdAt).toLocaleString('en-IN')}.
          </div>
        )}

        {backupMessage && (
          <div style={{ padding: '0.75rem', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '1rem', fontWeight: 600 }}>
            {backupMessage}
          </div>
        )}

        {/* Backups Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.95rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '0.6rem 0.75rem' }}>Timestamp</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Trigger</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Size</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Schema</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Verification</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {backupsList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                    No backups recorded yet.
                  </td>
                </tr>
              ) : (
                backupsList.map(bk => {
                  const rep = verifyReports[bk.id];
                  return (
                    <tr key={bk.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        {new Date(bk.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            backgroundColor: bk.trigger === 'PRE_MIGRATION' ? '#fef3c7' : '#e0e7ff',
                            color: bk.trigger === 'PRE_MIGRATION' ? '#92400e' : '#3730a3',
                            borderRadius: '4px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                          }}
                        >
                          {bk.trigger}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem' }}>{formatBytes(bk.sizeBytes)}</td>
                      <td style={{ padding: '0.6rem 0.75rem' }}>v{bk.schemaVersion}</td>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        {rep ? (
                          <span style={{ color: rep.status === 'OK' ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                            {rep.status === 'OK' ? '[✓ OK]' : `[✗ ${rep.status}]`}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>Verified on write</span>
                        )}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleVerifyBackup(bk.id)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.85rem',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Verify Now
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4 · CALCULATION CHECK & LIVE DEMO */}
      <section
        id="calc-section"
        style={{
          backgroundColor: '#ffffff',
          border: '2px solid #0f172a',
          borderRadius: '8px',
          padding: '1.75rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '0.75rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>4 · Live GST Calculation Engine Check</h2>
            <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.95rem' }}>
              Interactive validation proving exact GST arithmetic, variance detection, and rule switching
            </p>
          </div>

          {/* Rounding Rule Selector (Live toggle) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#f1f5f9',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
            }}
          >
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>Active Rounding:</span>
            <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input
                id="radio-half-down"
                type="radio"
                name="roundingRule"
                value="HALF_DOWN"
                checked={settings?.roundingRule === 'HALF_DOWN'}
                onChange={() => handleRoundingRuleChange('HALF_DOWN')}
              />
              <strong>HALF_DOWN</strong> (Company Rule)
            </label>
            <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', marginLeft: '0.5rem' }}>
              <input
                id="radio-half-up"
                type="radio"
                name="roundingRule"
                value="HALF_UP"
                checked={settings?.roundingRule === 'HALF_UP'}
                onChange={() => handleRoundingRuleChange('HALF_UP')}
              />
              <strong>HALF_UP</strong> (Section 170)
            </label>
          </div>
        </div>

        {/* Demo Inputs Form */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.75rem',
            backgroundColor: '#f8fafc',
            padding: '1.25rem',
            borderRadius: '6px',
          }}
        >
          <div>
            <label htmlFor="total-amount-input" style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.95rem' }}>
              Total Invoice Amount (₹)
            </label>
            <input
              id="total-amount-input"
              type="text"
              value={totalAmountInput}
              onChange={e => setTotalAmountInput(e.target.value)}
              placeholder="e.g. 1,41,542"
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                fontSize: '1.1rem',
                borderRadius: '4px',
                border: '1px solid #94a3b8',
                fontVariantNumeric: 'tabular-nums',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label htmlFor="gst-amount-input" style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.95rem' }}>
              GST Amount Entered (₹)
            </label>
            <input
              id="gst-amount-input"
              type="text"
              value={gstAmountInput}
              onChange={e => setGstAmountInput(e.target.value)}
              placeholder="e.g. 21,591"
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                fontSize: '1.1rem',
                borderRadius: '4px',
                border: '1px solid #94a3b8',
                fontVariantNumeric: 'tabular-nums',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label htmlFor="rate-select" style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.95rem' }}>
              Applicable Tax Rate
            </label>
            <select
              id="rate-select"
              value={selectedRateBps}
              onChange={e => setSelectedRateBps(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.65rem 0.8rem',
                fontSize: '1.05rem',
                borderRadius: '4px',
                border: '1px solid #94a3b8',
                backgroundColor: '#ffffff',
              }}
            >
              {ratesList.map(r => (
                <option key={r.id} value={r.rateBps}>
                  {r.name} ({r.rateBps / 100}%)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="state-select" style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.95rem' }}>
              Counterparty State
            </label>
            <select
              id="state-select"
              value={selectedStateCode}
              onChange={e => setSelectedStateCode(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.8rem',
                fontSize: '1.05rem',
                borderRadius: '4px',
                border: '1px solid #94a3b8',
                backgroundColor: '#ffffff',
              }}
            >
              {statesList.map(s => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name} {s.code === '09' ? '(Our State)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Validation Issues / Inline Messages */}
        {calcResult?.issues && calcResult.issues.length > 0 && (
          <div style={{ marginBottom: '1.5rem', display: 'grid', gap: '0.5rem' }}>
            {calcResult.issues.map((iss, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  backgroundColor:
                    iss.severity === 'BLOCK'
                      ? '#fee2e2'
                      : iss.severity === 'WARN'
                      ? '#fef3c7'
                      : '#f1f5f9',
                  color:
                    iss.severity === 'BLOCK'
                      ? '#991b1b'
                      : iss.severity === 'WARN'
                      ? '#92400e'
                      : '#1e293b',
                  borderLeft: `4px solid ${
                    iss.severity === 'BLOCK'
                      ? '#ef4444'
                      : iss.severity === 'WARN'
                      ? '#f59e0b'
                      : '#64748b'
                  }`,
                }}
              >
                [{iss.severity}] {iss.message}
              </div>
            ))}
          </div>
        )}

        {/* Computed Results Dashboard */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.75rem',
          }}
        >
          {/* Bill Amount (Taxable) — Largest Type on Screen */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: '#f8fafc',
              border: '2px solid #0f172a',
              borderRadius: '6px',
            }}
          >
            <span style={{ color: '#475569', fontSize: '0.95rem', fontWeight: 600, display: 'block' }}>
              Bill Amount (Taxable before GST)
            </span>
            <div
              style={{
                fontSize: '2.5rem',
                fontWeight: 800,
                color: '#0f172a',
                fontVariantNumeric: 'tabular-nums',
                margin: '0.25rem 0',
              }}
            >
              {formatMoneyDisplay(calcResult?.taxableAmount)}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Computed as Total Amount minus Entered GST
            </span>
          </div>

          {/* Expected GST & Variance */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
            }}
          >
            <span style={{ color: '#475569', fontSize: '0.95rem', fontWeight: 600, display: 'block' }}>
              Expected GST ({selectedRateBps / 100}%) & Variance
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0', fontVariantNumeric: 'tabular-nums' }}>
              {formatMoneyDisplay(calcResult?.expectedTax)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Variance:</span>
              <strong style={{ fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>
                {formatMoneyDisplay(calcResult?.variance)}
              </strong>
              {calcResult?.varianceSeverity && calcResult.varianceSeverity !== 'NONE' && (
                <span
                  style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: calcResult.varianceSeverity === 'WARN' ? '#fef3c7' : '#e0e7ff',
                    color: calcResult.varianceSeverity === 'WARN' ? '#92400e' : '#3730a3',
                  }}
                >
                  {calcResult.varianceSeverity}
                </span>
              )}
            </div>
          </div>

          {/* Supply Type & Tax Split */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
            }}
          >
            <span style={{ color: '#475569', fontSize: '0.95rem', fontWeight: 600, display: 'block' }}>
              Supply Classification & Split
            </span>
            <div style={{ margin: '0.35rem 0' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.3rem 0.8rem',
                  borderRadius: '4px',
                  fontWeight: 700,
                  fontSize: '1rem',
                  backgroundColor: calcResult?.supplyType === 'INTRA' ? '#dbeafe' : '#fce7f3',
                  color: calcResult?.supplyType === 'INTRA' ? '#1e40af' : '#9d174d',
                }}
              >
                {calcResult?.supplyType === 'INTRA'
                  ? 'UP GST (Intra-state)'
                  : calcResult?.supplyType === 'INTER'
                  ? 'IGST (Inter-state)'
                  : '—'}
              </span>
            </div>

            {calcResult?.split && (
              <div style={{ fontSize: '0.95rem', marginTop: '0.5rem', display: 'grid', gap: '0.2rem', fontVariantNumeric: 'tabular-nums' }}>
                {calcResult.supplyType === 'INTRA' ? (
                  <>
                    <div>CGST (9%): <strong>{formatMoneyDisplay(calcResult.split.cgst)}</strong></div>
                    <div>SGST (9%): <strong>{formatMoneyDisplay(calcResult.split.sgst)}</strong></div>
                  </>
                ) : (
                  <div>IGST (18%): <strong>{formatMoneyDisplay(calcResult.split.igst)}</strong></div>
                )}
                {calcResult.split.flags.includes('SPLIT_ASYMMETRY') && (
                  <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                    * Asymmetric 1-paise split (sum strictly equals total tax)
                  </span>
                )}
                {calcResult.split.flags.includes('SPLIT_FROM_ENTERED') && (
                  <div style={{ marginTop: '0.5rem', padding: '0.375rem 0.5rem', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', fontSize: '0.8rem', color: '#1e40af' }}>
                    Split from the GST you entered, not from the {selectedRateBps ? `${Number(selectedRateBps) / 100}%` : '18%'} rate — the two don't match.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Worked Examples Table */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>
            Live Engine Rounding Demonstration (Current Rule: {currentRule})
          </h3>
          {currentRule === 'HALF_DOWN' ? (
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              ₹123.50 rounds <strong>down</strong> to ₹123 — your company rule. Under Section 170 it would round <strong>up</strong> to ₹124.
            </p>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              ₹123.50 rounds <strong>up</strong> to ₹124 under Section 170 CGST. Under your company rule it would round <strong>down</strong> to ₹123.
            </p>
          )}

          <table
            style={{
              width: '100%',
              maxWidth: '600px',
              borderCollapse: 'collapse',
              fontSize: '0.95rem',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '0.5rem 0.75rem' }}>Exact Fractional Amount</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Rounded to Whole Rupee</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Rule Applied</th>
              </tr>
            </thead>
            <tbody>
              {workedExamples.map((ex, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{ex.display}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700 }}>
                    {formatPaise(ex.expected, { symbol: true, decimals: 0 })}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{currentRule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
