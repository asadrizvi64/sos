import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../drizzle/schema';
import dotenv from 'dotenv';

// Load environment variables if not already loaded
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Use shared session pooler connection (works with IPv4/IPv6)
// Format: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-us-west-1.pooler.supabase.com:5432/postgres
let connectionString = process.env.DATABASE_URL;

// Convert direct connection to shared session pooler if needed
// Direct connections often fail with ENOTFOUND, so always use pooler for known Supabase projects
if (connectionString.includes('db.qgfutvkhhsjbjthkammv.supabase.co')) {
  // Extract password from original URL if present
  const passwordMatch = connectionString.match(/:\/\/[^:]+:([^@]+)@/);
  const password = passwordMatch ? passwordMatch[1] : 'SynthralOS';
  connectionString = `postgresql://postgres.qgfutvkhhsjbjthkammv:${password}@aws-1-us-west-1.pooler.supabase.com:5432/postgres`;
}

// Configure postgres client
const client = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
  onnotice: () => {}, // Suppress notices
});

export const db = drizzle(client, { schema });

export * from '../../drizzle/schema';
