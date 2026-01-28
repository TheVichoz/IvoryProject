import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tjtsohembwgqwvskekwh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdHNvaGVtYndncXd2c2tla3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5NzU5ODksImV4cCI6MjA3MTU1MTk4OX0.VPZZPE2KS_7v-9nKSzhsvIuRp7bETHEebyfl23xXXHI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);