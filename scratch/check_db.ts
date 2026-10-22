import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log('Tables in Neon:', tables.rows.map(r => r.table_name));

  for (const t of tables.rows) {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [t.table_name]);
    console.log('Table:', t.table_name, '-> cols:', cols.rows.map(c => c.column_name).join(', '));
  }
  process.exit(0);
}
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
