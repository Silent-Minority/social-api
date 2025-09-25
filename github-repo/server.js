#!/usr/bin/env node

// Deployment entrypoint for Replit
// This file starts the Express API server for production deployment

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set production environment
process.env.NODE_ENV = 'production';

// Ensure PORT is set (Replit requirement)
if (!process.env.PORT) {
  process.env.PORT = '5000';
}

console.log(`🚀 Starting Mirancourt Social API server on port ${process.env.PORT}`);
console.log(`📍 Environment: ${process.env.NODE_ENV}`);

// Start the TypeScript server using tsx (already installed)
const serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  cwd: __dirname,
  env: process.env
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('📥 Received SIGTERM, shutting down gracefully...');
  serverProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📥 Received SIGINT, shutting down gracefully...');
  serverProcess.kill('SIGINT');
});

// Handle server process events
serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

serverProcess.on('exit', (code, signal) => {
  if (signal) {
    console.log(`🛑 Server process terminated by signal: ${signal}`);
  } else {
    console.log(`🛑 Server process exited with code: ${code}`);
  }
  process.exit(code || 0);
});

console.log('✅ Server.js deployment entrypoint initialized');