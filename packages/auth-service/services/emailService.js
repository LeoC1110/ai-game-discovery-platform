import nodemailer from 'nodemailer';

let transport;

const getTransport = () => {
  if (transport) return transport;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Email service is not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD in .env.');
  }

  transport = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: { user, pass },
  });

  return transport;
};

export const sendResetPasswordCodeEmail = async ({ to, code }) => {
  const sender = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const appName = process.env.EMAIL_APP_NAME || 'Game Discovery Platform';

  const mailOptions = {
    from: sender,
    to,
    subject: `${appName} password reset code`,
    text: `Your password reset verification code is ${code}. This code will expire in 10 minutes.`,
    html: `<p>Your password reset verification code is <strong>${code}</strong>.</p><p>This code will expire in 10 minutes.</p>`,
  };

  await getTransport().sendMail(mailOptions);
};
