import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath, override: true });

export interface AppConfig {
  port: number;
  adminPort: number;
  adminPanelUrl: string;
  databaseUrl: string;
  botToken: string;
  geminiApiKey: string;
  geminiApiKey2: string;
  adminPassword: string;
  adminId: string;
}

function parseAdminId(): string {
  const raw = (process.env.ADMIN_ID || '8145529224').trim().replace(/^@/, '');
  return raw;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  adminPort: parseInt(process.env.ADMIN_PORT || '3000', 10),
  adminPanelUrl: process.env.ADMIN_PANEL_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/arab_bot',
  botToken: (process.env.BOT_TOKEN || '').trim(),
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiApiKey2: (process.env.GEMINI_API_KEY_2 || '').trim(),
  adminPassword: (process.env.ADMIN_PASSWORD || '123').trim(),
  adminId: parseAdminId(),
};

export function reloadConfig(): AppConfig {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
  }
  config.port = parseInt(process.env.PORT || '5000', 10);
  config.adminPort = parseInt(process.env.ADMIN_PORT || '3000', 10);
  config.adminPanelUrl = process.env.ADMIN_PANEL_URL || 'http://localhost:3000';
  config.databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/arab_bot';
  config.botToken = (process.env.BOT_TOKEN || '').trim();
  config.geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();
  config.geminiApiKey2 = (process.env.GEMINI_API_KEY_2 || '').trim();
  config.adminPassword = (process.env.ADMIN_PASSWORD || '123').trim();
  config.adminId = parseAdminId();
  return config;
}
