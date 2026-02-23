import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. THE VERIFIED URL (Double 'd' - DO NOT CHANGE)
// ==========================================
const SUPABASE_URL = "https://ceanhylddttjnfcimkkp.supabase.co";

// ==========================================
// 2. PASTE YOUR KEY HERE
// ==========================================
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlYW5oeWxkZHR0am5mY2lta2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MjMzMzksImV4cCI6MjA4NDM5OTMzOX0.JAMGii1eiQv6pwxcVKQFKZKxWeFdZHCKH1ZNmdR7_JM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);