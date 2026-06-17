// Temporary debug script — run this in browser console to test DB connection
// Open browser DevTools → Console, then paste this (or import in main.jsx temporarily)

import { supabase } from './supabase.js';

export async function debugDatabase() {
  console.log('=== TasmiqAI DB Debug ===');
  
  // Test 1: Can we reach the users table at all?
  const { data, error } = await supabase
    .from('users')
    .select('uid, email, role, password_hash, full_name, display_name')
    .limit(5);

  if (error) {
    console.error('❌ QUERY FAILED:', error.message);
    console.error('   Code:', error.code);
    console.error('   Hint:', error.hint);
    console.log('\n👉 FIX: Run FIX_DATABASE_RLS.sql in Supabase SQL Editor');
    return;
  }

  console.log('✅ Users table reachable. Rows:', data?.length);
  if (data?.length > 0) {
    console.log('   Columns in first row:', Object.keys(data[0]));
    console.log('   Sample (no passwords):', data.map(r => ({
      uid: r.uid?.slice(0, 8) + '...',
      email: r.email,
      role: r.role,
      has_password_hash: !!r.password_hash,
      has_full_name: !!r.full_name,
      has_display_name: !!r.display_name,
    })));
  } else {
    console.warn('⚠️ Table is empty — no users found');
  }
}
