// Vercel serverless function: /api/webhook
// Listens for Stripe checkout.session.completed, generates a unique unlock key,
// stores it, and emails the customer their unlock link via Resend.
//
// IMPORTANT: this file disables body parsing so Stripe signature verification
// works on the raw request body (see `export const config` at the bottom).

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Optional persistent store. If Vercel KV is connected its env vars exist and
// we use it; otherwise we fall back to in-memory (fine for first live tests).
let kv = null;
try {
  if (process.env.KV_REST_API_URL) {
    kv = require('@vercel/kv').kv;
  }
} catch (e) {
  kv = null;
}
const memory = {};

async function storeKey(unlockKey, data) {
  if (kv) {
    await kv.set('unlock:' + unlockKey, data);
  } else {
    memory[unlockKey] = data;
  }
}

// Read the raw body for Stripe signature verification.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });
}

function generateUnlockKey(productKey) {
  const random = Math.random().toString(36).substring(2, 8).toLowerCase();
  return productKey + '-' + random;
}

async function sendConfirmationEmail(email, productName, unlockKey) {
  if (!email) return;
  const unlockLink = 'https://thetravellab.co.uk/unlock/' + unlockKey;
  const html = [
    'Hello, and welcome to The Travel Lab Academy!',
    '',
    'Thank you for unlocking <strong>' + productName + '</strong>.',
    '',
    '<strong>Your personal unlock link:</strong><br>' +
      '<a href="' + unlockLink + '">' + unlockLink + '</a>',
    '',
    'Open it on any device to start your adventure. It works offline after the first load, so you can take it anywhere.',
    '',
    'Dream Discover Become',
    'The Travel Lab Academy by C442 Apps',
  ].join('<br>');

  try {
    await resend.emails.send({
      from: 'The Travel Lab Academy <onboarding@resend.dev>', // swap to hello@thetravellab.co.uk once the domain is verified in Resend
      to: email,
      subject: 'Your Travel Lab Academy ' + productName + ' is ready',
      html: html,
    });
  } catch (err) {
    console.error('Resend email failed:', err);
    // Do not fail the webhook just because email failed; key is still stored.
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const md = session.metadata || {};
    const productKey = md.product_key || 'unknown';
    const productName = md.product_name || 'Your Pack';
    const email = session.customer_details && session.customer_details.email
      ? session.customer_details.email
      : session.customer_email;

    const unlockKey = generateUnlockKey(productKey);

    await storeKey(unlockKey, {
      product: productKey,
      productName: productName,
      email: email || null,
      created: new Date().toISOString(),
    });

    await sendConfirmationEmail(email, productName, unlockKey);
    console.log('Unlock key created:', unlockKey, 'for', email);
  }

  return res.status(200).json({ received: true });
};

// Stripe needs the raw body, so turn off Vercel's automatic JSON parsing.
module.exports.config = {
  api: { bodyParser: false },
};
