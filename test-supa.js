require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("URL:", JSON.stringify(supabaseUrl));
console.log("Key length:", supabaseServiceKey ? supabaseServiceKey.length : 0);

const supabase = createClient(supabaseUrl, supabaseServiceKey);
supabase.auth.admin.listUsers().then(res => {
  console.log("Success:", res.data?.users?.length);
  if (res.error) console.log("Error:", res.error.message);
}).catch(err => {
  console.log("Crash:", err.message);
});
