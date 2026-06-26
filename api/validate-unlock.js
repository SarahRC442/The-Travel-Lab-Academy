// Verifies a signed Travel Lab Academy access link.
const crypto = require('crypto');

const ACCESS_SECRET = process.env.UNLOCK_SIGNING_SECRET;
const ALLOWED_PRODUCTS = new Set([
  'littlebuilder',
  'adventureexplorer',
  'principalarchitect',
  'careerbundle',
  'founderpass',
]);

function safeEqual(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b || '');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyAccessToken(token) {
  if (!ACCESS_SECRET || !token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', ACCESS_SECRET).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || !ALLOWED_PRODUCTS.has(data.p) || !data.exp || data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const token = String((req.query && req.query.token) || '');
  const data = verifyAccessToken(token);
  if (!data) {
    return res.status(200).json({ valid: false });
  }
  return res.status(200).json({ valid: true, product: data.p });
};
