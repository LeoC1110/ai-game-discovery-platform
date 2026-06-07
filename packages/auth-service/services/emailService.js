import nodemailer from 'nodemailer';

const EMAIL_SEND_TIMEOUT_MS = 10_000;

let transport;

const getTransport = () => {
  if (transport) return transport;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Email service is not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD in .env.');
  }

  // Explicit Gmail SMTP settings are more reliable on cloud hosts than the
  // built-in 'service: gmail' shorthand, which can pick the wrong port.
  transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // TLS on port 465
    auth: { user, pass },
    connectionTimeout: EMAIL_SEND_TIMEOUT_MS,
    greetingTimeout: EMAIL_SEND_TIMEOUT_MS,
    socketTimeout: EMAIL_SEND_TIMEOUT_MS,
  });

  return transport;
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);

export const sendResetPasswordCodeEmail = async ({ to, code }) => {
  const sender = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const appName = process.env.EMAIL_APP_NAME || 'Discovery Platform';

  const mailOptions = {
    from: sender,
    to,
    subject: `${appName} verification code`,
    text: `Your verify code: ${code}\n\n-- Discovery Platform`,
  };

  console.log(`[Email] Attempting to send reset code to: ${to}`);
  try {
    const info = await withTimeout(
      getTransport().sendMail(mailOptions),
      EMAIL_SEND_TIMEOUT_MS,
      'sendMail',
    );
    console.log(`[Email] Sent successfully to: ${to} | messageId: ${info.messageId}`);
  } catch (err) {
    console.error(`[Email] SMTP error sending to ${to}: ${err.message}`);
    throw err;
  }
};
