// Vercel serverless function: /api/create-checkout-session
// Creates a Stripe Checkout Session and returns its URL.
// The front-end "Buy Now" button calls this, then redirects to session.url.
//
// This is the piece that was missing — without it the Buy button had nothing
// to call, which is why checkout errored.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Single source of truth for products: id, friendly name, unlock key, price (pence).
// Prices are created inline from these amounts so you don't need Stripe Price IDs.
const PRODUCTS = {
  prod_UiL1AQi55TDFz6: { name: 'Little Builder',       key: 'littlebuilder',       amount: 599 },
  prod_UliVsaZDbw1ET9: { name: 'Adventure Explorer',   key: 'adventureexplorer',   amount: 599 },
  prod_UliWLaQiMJbrO2: { name: 'Principal Architect',  key: 'principalarchitect',  amount: 599 },
  prod_UiL1excr3WDkaI: { name: 'Career Bundle',        key: 'careerbundle',        amount: 1299 },
  prod_UiL3IsUFSsuauW: { name: 'Founder Pass',         key: 'founderpass',         amount: 4999 },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel may pass body as string; handle both.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { productId, email } = body;

    const product = PRODUCTS[productId];
    if (!product) {
      return res.status(400).json({ error: 'Unknown product: ' + productId });
    }

    const origin = req.headers.origin || 'https://thetravellab.co.uk';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: product.amount,
          product_data: { name: 'The Travel Lab Academy — ' + product.name },
        },
        quantity: 1,
      }],
      // metadata travels through to the webhook so we know what was bought.
      metadata: {
        product_id: productId,
        product_key: product.key,
        product_name: product.name,
      },
      success_url: origin + '/?success=true&product=' + encodeURIComponent(product.name) + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/?canceled=true',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: err.message });
  }
};
