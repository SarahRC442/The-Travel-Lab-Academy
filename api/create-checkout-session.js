// Creates a Stripe-hosted Checkout Session for one Travel Lab Academy pack.
// Secret keys stay in Vercel Environment Variables, never in GitHub.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SITE_URL = (process.env.SITE_URL || 'https://www.thetravellabacademy.co.uk').replace(/\/$/, '');

const PRODUCTS = {
  littlebuilder: {
    stripeProductId: 'prod_UiL1AQi55TDFz6',
    name: 'Little Builder',
    amount: 599,
  },
  adventureexplorer: {
    stripeProductId: 'prod_UliVsaZDbw1ET9',
    name: 'Adventure Explorer',
    amount: 599,
  },
  principalarchitect: {
    stripeProductId: 'prod_UliWLaQiMJbrO2',
    name: 'Principal Architect',
    amount: 599,
  },
  careerbundle: {
    stripeProductId: 'prod_UiL1excr3WDkaI',
    name: 'Future Architect Career Bundle',
    amount: 1299,
  },
  founderpass: {
    stripeProductId: 'prod_UiL3IsUFSsuauW',
    name: 'Founder Academy Pass',
    amount: 4999,
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const productKey = String(body.productKey || '');
    const email = String(body.email || '').trim();
    const product = PRODUCTS[productKey];

    if (!product) {
      return res.status(400).json({ error: 'Unknown product.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: product.amount,
          product: product.stripeProductId,
        },
        quantity: 1,
      }],
      metadata: {
        product_key: productKey,
        product_name: product.name,
      },
      success_url: SITE_URL + '/?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: SITE_URL + '/?checkout=cancelled',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: 'We could not start secure checkout. Please try again.' });
  }
};
