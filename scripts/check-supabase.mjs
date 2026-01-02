import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.log('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: 'ferry_forecast' }
});

// Get today's date in America/New_York
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
console.log('Today (ET):', today);

const { data, error } = await supabase
  .from('sailing_events')
  .select('*')
  .eq('service_date', today)
  .order('observed_at', { ascending: false });

if (error) {
  console.log('Error:', error);
  process.exit(1);
}

console.log('Sailing events for today:', data?.length || 0);
if (data && data.length > 0) {
  data.forEach(e => {
    console.log(`  ${e.from_port} -> ${e.to_port} @ ${e.departure_time}: ${e.status} (${e.status_message || 'no message'})`);
  });
}
