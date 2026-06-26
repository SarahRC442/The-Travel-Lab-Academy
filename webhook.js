// Receives Stripe checkout.session.completed, creates a signed access link,
// and emails it through Resend. The link can be opened on any device.
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const SITE_URL = (process.env.SITE_URL || 'https://www.thetravellabacademy.co.uk').replace(/\/$/, '');
const ACCESS_SECRET = process.env.UNLOCK_SIGNING_SECRET;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createAccessToken(productKey, sessionId) {
  if (!ACCESS_SECRET) {
    throw new Error('UNLOCK_SIGNING_SECRET is not set');
  }
  const payload = Buffer.from(JSON.stringify({
    p: productKey,
    s: sessionId,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 2),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', ACCESS_SECRET).update(payload).digest('base64url');
  return payload + '.' + signature;
}

async function sendAccessEmail(email, productName, accessToken) {
  if (!RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL is not set');
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const accessLink = SITE_URL + '/unlock/' + accessToken;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1F3A5F;max-width:620px;margin:0 auto;padding:24px">
      <h1 style="margin:0 0 16px;color:#1F3A5F">Your adventure is ready</h1>
      <p>Thank you for unlocking <strong>${escapeHtml(productName)}</strong>.</p>
      <p>Use your personal link below whenever you want to open this adventure. It works on any device.</p>
      <p style="margin:28px 0">
        <a href="${accessLink}" style="display:inline-block;background:#E91E8C;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:28px;font-weight:bold">Open My Adventure</a>
      </p>
      <p style="font-size:13px;color:#52687f">Dream • Discover • Become<br>The Travel Lab Academy</p>
    </div>`;

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: email,
    subject: 'Your Travel Lab Academy adventure is ready',
    html,
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook Error');
  }

  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object;
      const productKey = session.metadata && session.metadata.product_key;
      const productName = session.metadata && session.metadata.product_name;
      const email = (session.customer_details && session.customer_details.email) || session.customer_email;

      if (!productKey || !productName || !email) {
        throw new Error('Missing purchase metadata or email');
      }

      const accessToken = createAccessToken(productKey, session.id);
      await sendAccessEmail(email, productName, accessToken);
      console.log('Access email sent for', session.id);
    } catch (err) {
      console.error('Access email failed:', err.message);
      // Return 500 so Stripe retries the webhook rather than silently losing access.
      return res.status(500).json({ error: 'Could not send access email' });
    }
  }

  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: { bodyParser: false },
};
