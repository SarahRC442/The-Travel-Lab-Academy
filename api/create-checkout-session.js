// Vercel serverless function: /api/create-checkout-session
// Creates a Stripe Checkout Session and returns its URL.
// Front-end "Unlock" button calls this, then redirects to session.url.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Single source of truth for products.
// Keyed by the SHORT productKey the front-end sends (e.g. "littlebuilder"),
// NOT by Stripe's prod_... id. This is what fixes the productKey/productId bug.
const PRODUCTS = {
    littlebuilder:       { stripeId: 'prod_UiL1AQi55TDFz6', name: 'Little Builder',       amount: 599 },
    adventureexplorer:   { stripeId: 'prod_UliVsaZDbw1ET9', name: 'Adventure Explorer',   amount: 599 },
    principalarchitect:  { stripeId: 'prod_UliWLaQiMJbrO2', name: 'Principal Architect',  amount: 599 },
    careerbundle:        { stripeId: 'prod_UiL1excr3WDkaI', name: 'Future Architect Career Bundle', amount: 1299 },
    founderpass:         { stripeId: 'prod_UiL3IsUFSsuauW', name: 'Founder Academy Pass', amount: 4999 },
};

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        // Accept both productKey (new) and productId (legacy) for safety.
        const productKey = body.productKey || body.productId;
        const email = body.email;

        const product = PRODUCTS[productKey];
        if (!product) {
            return res.status(400).json({ error: 'Unknown product: ' + productKey });
        }

        const origin = req.headers.origin || 'https://thetravellabacademy.co.uk';

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    unit_amount: product.amount,
                    product_data: { name: 'The Travel Lab Academy - ' + product.name },
                },
                quantity: 1,
            }],
            metadata: {
                product_key: productKey,
                product_name: product.name,
                stripe_product_id: product.stripeId,
            },
            success_url: origin + '/?checkout=success&product=' + encodeURIComponent(product.name) + '&session_id={CHECKOUT_SESSION_ID}',
            cancel_url: origin + '/?checkout=canceled',
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('create-checkout-session error:', err);
        return res.status(500).json({ error: err.message });
    }
};
