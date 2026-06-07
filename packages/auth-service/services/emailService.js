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
  const appName = process.env.EMAIL_APP_NAME || 'Discovery Platform';

  const mailOptions = {
    from: sender,
    to,
    subject: `${appName} verification code`,
    text: `Your verify code: ${code}\n\n-- Discovery Platform`,
  };

  await getTransport().sendMail(mailOptions);
};
