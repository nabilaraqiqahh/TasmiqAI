import React, { useState } from 'react';
import { supabase } from '../supabase';

// Temporary diagnostic page — accessible at /dbtest
// Remove this file when everything is working
export default function DbTest() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runTest = async () => {
    setRunning(true);
    const log = [];

    // ── TEST 1: Can we reach Supabase at all? ──
    log.push({ label: '1. Supabase URL', value: import.meta.env.VITE_SUPABASE_URL || '(hardcoded fallback)' });

    // ── TEST 2: Raw query on users table ──
    const { data: rows, error: fetchErr } = await supabase
      .from('users')
      .select('uid, email, role, full_name, display_name, password_hash')
      .limit(10);

    if (fetchErr) {
      log.push({ label: '2. users SELECT', value: `❌ ERROR: ${fetchErr.message}`, detail: `code=${fetchErr.code} hint=${fetchErr.hint}` });
    } else {
      log.push({ label: '2. users SELECT', value: `✅ Got ${rows?.length ?? 0} rows` });
      rows?.forEach((r, i) => {
        log.push({
          label: `   Row ${i + 1}`,
          value: `email=${r.email} | role=${r.role} | full_name=${r.full_name} | display_name=${r.display_name} | password_hash=${r.password_hash ? r.password_hash.slice(0, 10) + '...' : 'NULL'}`
        });
      });
    }

    // ── TEST 3: Simulate exact login query ──
    const testEmail = 'ustaz_ali@staff.tahfiz.my';
    const { data: loginRow, error: loginErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', testEmail)
      .maybeSingle();

    if (loginErr) {
      log.push({ label: `3. Login query for ${testEmail}`, value: `❌ ERROR: ${loginErr.message}` });
    } else if (!loginRow) {
      log.push({ label: `3. Login query for ${testEmail}`, value: '⚠️ No row returned (user not found)' });
    } else {
      log.push({ label: `3. Login query for ${testEmail}`, value: '✅ Row found' });
      log.push({ label: '   role', value: loginRow.role });
      log.push({ label: '   password_hash', value: loginRow.password_hash ?? 'NULL' });
      log.push({ label: '   full_name', value: loginRow.full_name ?? 'NULL' });
      log.push({ label: '   display_name', value: loginRow.display_name ?? 'NULL' });
      log.push({ label: '   pwd "123456" matches?', value: loginRow.password_hash === '123456' ? '✅ YES' : `❌ NO — stored is "${loginRow.password_hash}"` });
    }

    // ── TEST 4: Check RLS policies ──
    let policies = null, policyErr = null;
    try {
      const result = await supabase.rpc('get_policies_for_users').single();
      policies = result.data;
      policyErr = result.error;
    } catch (e) {
      policyErr = { message: 'RPC not available' };
    }
    log.push({ label: '4. RLS check', value: policyErr ? `ℹ️ ${policyErr.message}` : JSON.stringify(policies) });

    setResult(log);
    setRunning(false);
  };

  const C = { bg: '#F5F2E9', card: '#fff', primary: '#10B981', text: '#1E2A22', muted: '#5C6E65', red: '#E05252', green: '#10B981', gold: '#D4AF37' };

  return (
    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto', fontFamily: 'monospace' }}>
      <h1 style={{ color: C.primary, fontSize: '24px', fontWeight: '900', marginBottom: '8px' }}>🔍 Database Diagnostic</h1>
      <p style={{ color: C.muted, marginBottom: '24px', fontFamily: 'sans-serif' }}>
        This page tests your Supabase connection directly. Open browser DevTools → Console for more details.
      </p>

      <button
        onClick={runTest}
        disabled={running}
        style={{ backgroundColor: C.primary, color: 'white', border: 'none', borderRadius: '12px', padding: '14px 28px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '32px' }}
      >
        {running ? '⏳ Running tests...' : '▶ Run Database Tests'}
      </button>

      {result && (
        <div style={{ backgroundColor: '#0D1117', borderRadius: '16px', padding: '24px', color: '#E6EDF3' }}>
          {result.map((item, i) => (
            <div key={i} style={{ marginBottom: '6px', lineHeight: '1.6' }}>
              <span style={{ color: '#79C0FF', fontWeight: 'bold' }}>{item.label}: </span>
              <span style={{ color: item.value?.startsWith('❌') ? '#FF7B72' : item.value?.startsWith('✅') ? '#3FB950' : item.value?.startsWith('⚠️') ? '#D29922' : '#E6EDF3' }}>
                {item.value}
              </span>
              {item.detail && <div style={{ color: '#8B949E', fontSize: '12px', marginLeft: '16px' }}>{item.detail}</div>}
            </div>
          ))}
        </div>
      )}

      <p style={{ color: C.muted, marginTop: '24px', fontSize: '13px', fontFamily: 'sans-serif' }}>
        ⚠️ Remove this page (src/screens/DbTest.jsx) before going to production.
      </p>
    </div>
  );
}


