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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveInviteName(name, to) {
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }

  const localPart = String(to || '').split('@')[0] || '';
  const parts = localPart
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`);

  return parts.join(' ').trim() || 'there';
}

function buildInviteHtml({ name, inviteUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>AHM App Invitation</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; padding:40px;">
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <img src="https://cdn.prod.website-files.com/695060a70f86706055aaf7e5/696531eb7ecaf37fcfae560f_Frame%2010.png" alt="AHM App Logo" width="120" />
            </td>
          </tr>

          <tr>
            <td style="font-size:24px; font-weight:bold; color:#333; padding-bottom:20px;">
              Hi ${escapeHtml(name)},
            </td>
          </tr>

          <tr>
            <td style="font-size:16px; color:#555; line-height:1.6; padding-bottom:30px;">
              You’ve been invited to join <strong>AHM App</strong>.<br><br>
              This invitation gives you access to the platform, where you can start managing and using the available features assigned to your account. We’ve made the setup process simple so you can get started quickly without any hassle.<br><br>
              To begin, please click the button below and complete your account setup. Once done, you’ll be able to log in and start using the application right away.
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:30px;">
              <a href="${escapeHtml(inviteUrl)}"
                 style="background-color:#1a73e8; color:#ffffff; padding:14px 28px; text-decoration:none; border-radius:6px; font-size:16px; display:inline-block;">
                Set up your account
              </a>
            </td>
          </tr>

          <tr>
            <td style="font-size:14px; color:#777; line-height:1.6; padding-bottom:20px;">
              If the button above does not work, you can copy and paste the following link into your browser:<br>
              <span style="color:#1a73e8;">${escapeHtml(inviteUrl)}</span>
            </td>
          </tr>

          <tr>
            <td style="font-size:14px; color:#777; text-align:center;">
              Welcome aboard,<br>
              <strong>AHM App Team</strong>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildWebsiteContentReviewOtpHtml({ name, otp, expiresInMinutes }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>AHM Website Content Review Code</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; padding:40px;">
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <img src="https://cdn.prod.website-files.com/695060a70f86706055aaf7e5/696531eb7ecaf37fcfae560f_Frame%2010.png" alt="AHM App Logo" width="120" />
            </td>
          </tr>

          <tr>
            <td style="font-size:24px; font-weight:bold; color:#333; padding-bottom:20px;">
              Hi ${escapeHtml(name)},
            </td>
          </tr>

          <tr>
            <td style="font-size:16px; color:#555; line-height:1.6; padding-bottom:30px;">
              Use the verification code below to access the website content review page. This helps us confirm the email address before showing the content.
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:30px;">
              <div style="display:inline-block; letter-spacing:8px; font-size:32px; font-weight:bold; color:#1a73e8; background:#f4f6f8; border-radius:8px; padding:16px 24px;">
                ${escapeHtml(otp)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="font-size:14px; color:#777; line-height:1.6; padding-bottom:20px;">
              This code expires in ${escapeHtml(expiresInMinutes)} minutes. If you did not request this code, you can ignore this email.
            </td>
          </tr>

          <tr>
            <td style="font-size:14px; color:#777; text-align:center;">
              Thank you,<br>
              <strong>AHM App Team</strong>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendInviteEmail({ env, to, inviteUrl, role, name }) {
  const tx = createTransporter(env);
  const recipientName = resolveInviteName(name, to);

  await tx.sendMail({
    from: env.email.from,
    to,
    subject: 'You are invited to AHM App',
    text: `Hi ${recipientName},\n\nYou were invited as ${role}. Open this link to continue: ${inviteUrl}\n\nWelcome aboard,\nAHM App Team`,
    html: buildInviteHtml({ name: recipientName, inviteUrl })
  });
}

async function sendWebsiteContentReviewOtpEmail({ env, to, fullName, otp }) {
  const tx = createTransporter(env);
  const recipientName = resolveInviteName(fullName, to);
  const expiresInMinutes = String(env.websiteContentReview.otpExpiresMinutes);

  await tx.sendMail({
    from: env.email.from,
    to,
    subject: 'Your AHM website content review code',
    text: `Hi ${recipientName},\n\nYour website content review code is ${otp}. This code expires in ${expiresInMinutes} minutes.\n\nAHM App Team`,
    html: buildWebsiteContentReviewOtpHtml({
      expiresInMinutes,
      name: recipientName,
      otp,
    })
  });
}

async function sendNotificationEmail({ body, env, title, to }) {
  const tx = createTransporter(env);

  await tx.sendMail({
    from: env.email.from,
    to,
    subject: title,
    text: body,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; padding:32px;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px; color:#111827; font-size:20px;">${escapeHtml(title)}</h1>
              <p style="margin:0; color:#374151; font-size:14px; line-height:1.6;">${escapeHtml(body)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  });
}

module.exports = {
  sendInviteEmail,
  sendNotificationEmail,
  sendWebsiteContentReviewOtpEmail
};
