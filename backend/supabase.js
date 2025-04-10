const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://bvlcdseawnvuabwtqord.supabase.co"
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bGNkc2Vhd252dWFid3Rxb3JkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Mjk3MDIzOSwiZXhwIjoyMDU4NTQ2MjM5fQ._EFFxyR2hcKVugagtOqWuQKcX4K_iZBl_U3t3bEJqCc"
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
module.exports = supabase;
