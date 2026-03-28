const { AppError } = require('./errors');

let transporter;

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function canUsePasswordAuth(emailConfig) {
  return Boolean(emailConfig.user && emailConfig.pass);
}

function canUseGoogleOauth2(emailConfig) {
  return Boolean(
    emailConfig.user
      && emailConfig.googleClientId
      && emailConfig.googleClientSecret
      && emailConfig.googleRefreshToken
  );
}

function resolveAuthMode(emailConfig) {
  const mode = emailConfig.authMode;
  if (mode === 'password' || mode === 'google_oauth2') {
    return mode;
  }

  // auto: prefer OAuth2 when fully configured, else fallback to password.
  if (canUseGoogleOauth2(emailConfig)) return 'google_oauth2';
  return 'password';
}

function createTransporter(env) {
  if (transporter) return transporter;

  const required = ['host', 'port', 'from'];
  const missing = required.filter((key) => !env.email[key]);
  if (missing.length > 0) {
    throw new AppError(500, 'EMAIL_CONFIG_ERROR', `Missing email config fields: ${missing.join(', ')}`);
  }

  const authMode = resolveAuthMode(env.email);

  if (authMode === 'google_oauth2' && !canUseGoogleOauth2(env.email)) {
    throw new AppError(500, 'EMAIL_CONFIG_ERROR', 'Google OAuth2 SMTP config is incomplete.');
  }

  if (authMode === 'password' && !canUsePasswordAuth(env.email)) {
    throw new AppError(500, 'EMAIL_CONFIG_ERROR', 'SMTP username/password config is incomplete.');
  }

  // Lazy require keeps startup light if invite feature is not used.
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');

  const auth = authMode === 'google_oauth2'
    ? {
        type: 'OAuth2',
        user: env.email.user,
        clientId: env.email.googleClientId,
        clientSecret: env.email.googleClientSecret,
        refreshToken: env.email.googleRefreshToken
      }
    : {
        user: env.email.user,
        pass: env.email.pass
      };

  transporter = nodemailer.createTransport({
    host: env.email.host,
    port: readNumber(env.email.port, 587),
    secure: env.email.secure,
    auth
  });

  return transporter;
}

async function sendInviteEmail({ env, to, inviteUrl, role }) {
  const tx = createTransporter(env);

  await tx.sendMail({
    from: env.email.from,
    to,
    subject: 'You are invited to AHM App',
    text: `You were invited as ${role}. Open this link to continue: ${inviteUrl}`,
    html: `<p>You were invited as <strong>${role}</strong>.</p><p><a href="${inviteUrl}">Accept Invitation</a></p>`
  });
}

module.exports = {
  sendInviteEmail
};
