// Vercel serverless function: /api/validate-unlock?key=littlebuilder-abc123
// Returns { valid: true, product: 'littlebuilder' } if the key exists.
// The front-end calls this when someone opens an /unlock/ link, then stores
// the confirmed product in localStorage to unlock the matching mission.

let kv = null;
try {
    if (process.env.KV_REST_API_URL) {
        kv = require('@vercel/kv').kv;
    }
} catch (e) {
    kv = null;
}

const KNOWN_PRODUCTS = ['littlebuilder', 'adventureexplorer', 'principalarchitect', 'careerbundle', 'founderpass'];

module.exports = async function handler(req, res) {
    const key = (req.query && (req.query.key || req.query.token)) ? String(req.query.key || req.query.token) : '';
    if (!key) return res.status(400).json({ valid: false, error: 'No key' });

    try {
        if (kv) {
            const data = await kv.get('unlock:' + key);
            if (data && data.product) {
                return res.status(200).json({ valid: true, product: data.product, productName: data.productName });
            }
            return res.status(200).json({ valid: false });
        }
        // No KV connected: derive product from the key prefix as a fallback so
        // links still work during early testing (key format is "product-random").
        const product = key.split('-')[0];
        if (KNOWN_PRODUCTS.includes(product)) {
            return res.status(200).json({ valid: true, product: product, fallback: true });
        }
        return res.status(200).json({ valid: false });
    } catch (err) {
        console.error('validate-unlock error:', err);
        return res.status(500).json({ valid: false, error: err.message });
    }
};
