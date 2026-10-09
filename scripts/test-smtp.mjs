import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// Parse .env manually so we don't depend on external flags
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const user = process.env.SMTP_USER || process.env.GMAIL_USER;
const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

console.log('--- SMTP Diagnostic ---');
console.log('SMTP_USER:', user ? `"${user}"` : '(NOT SET)');
console.log('SMTP_PASS length:', pass ? pass.replace(/\s+/g, '').length : 0);

if (!user || !pass) {
  console.log('\n❌ ERROR: SMTP_USER or SMTP_PASS is empty in .env.');
  console.log('Please ensure you have saved (Ctrl+S) your .env file with your 16-character App Password.');
  process.exit(1);
}

const cleanPass = pass.replace(/\s+/g, '');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: user.trim(),
    pass: cleanPass,
  },
});

console.log('\nVerifying connection with Gmail SMTP server...');
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Connection verification failed:', error.message);
    if (error.message.includes('535') || error.message.includes('BadCredentials') || error.message.includes('Username and Password not accepted')) {
      console.error('\n👉 Google rejected the credentials. Possible causes:');
      console.error('1. The password is your normal Gmail password instead of an App Password.');
      console.error('2. Two-Factor Authentication is disabled on your Google account.');
      console.error('3. The 16-character App Password was revoked or mistyped.');
    }
    process.exit(1);
  } else {
    console.log('✅ Connection to Gmail SMTP server SUCCESSFUL! Server is ready to take our messages.');
    
    const targetEmail = process.argv[2] || user.trim();
    console.log(`Sending a test message to: ${targetEmail}...`);
    transporter.sendMail({
      from: `"DeskMate Diagnostic" <${user.trim()}>`,
      to: targetEmail,
      subject: 'DeskMate SMTP Test',
      text: 'This is a test email verifying Gmail SMTP delivery from DeskMate.',
    }, (sendErr, info) => {
      if (sendErr) {
        console.error('❌ Failed to send email:', sendErr.message);
      } else {
        console.log('🎉 Email sent successfully! MessageId:', info.messageId);
        console.log('Response:', info.response);
      }
    });
  }
});
