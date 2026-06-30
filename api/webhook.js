// Vercel serverless function: /api/webhook
// Listens for Stripe checkout.session.completed, generates an unlock key,
// stores it, and emails the customer their unlock link + printable PDF via Resend.
//
// IMPORTANT: this file disables body parsing so Stripe signature verification
// works on the raw request body (see `export const config` at the bottom).

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const resend = new Resend(process.env.RESEND_API_KEY);

// Sender email - change to your verified domain sender once Resend domain is verified.
const FROM_EMAIL = process.env.FROM_EMAIL || 'The Travel Lab Academy <hello@thetravellabacademy.co.uk>';
const SITE_URL = process.env.SITE_URL || 'https://thetravellabacademy.co.uk';

// Map product keys to the PDF filename in /public/pdfs/
const PRODUCT_PDFS = {
    littlebuilder:      'LittleBuilder_FINAL.pdf',
    adventureexplorer:  'AdventureExplorer_FINAL.pdf',
    principalarchitect: 'PrincipalArchitect_FINAL.pdf',
    // Career Bundle: send all 3 PDFs
    careerbundle:       ['LittleBuilder_FINAL.pdf', 'AdventureExplorer_FINAL.pdf', 'PrincipalArchitect_FINAL.pdf'],
    // Founder Pass: ALL PDFs released so far (currently the 3 Architect packs)
    founderpass:        ['LittleBuilder_FINAL.pdf', 'AdventureExplorer_FINAL.pdf', 'PrincipalArchitect_FINAL.pdf'],
};

// Optional persistent store. Use Vercel KV if available, otherwise in-memory.
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

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => resolve(Buffer.from(data)));
        req.on('error', reject);
    });
}

function generateUnlockKey(productKey) {
    const random = Math.random().toString(36).substring(2, 10).toLowerCase();
    return productKey + '-' + random;
}

function loadPdfAttachments(productKey) {
    const entry = PRODUCT_PDFS[productKey];
    if (!entry) return [];
    const files = Array.isArray(entry) ? entry : [entry];
    const attachments = [];
    for (const filename of files) {
        try {
            // PDFs live in /api/pdfs/ alongside this webhook file so Vercel
            // bundles them with the serverless function automatically.
            const filePath = path.join(__dirname, 'pdfs', filename);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath);
                attachments.push({
                    filename: filename,
                    content: content.toString('base64'),
                });
            } else {
                console.warn('PDF not found:', filePath);
            }
        } catch (err) {
            console.error('Error loading PDF', filename, err);
        }
    }
    return attachments;
}

async function sendConfirmationEmail(email, productKey, productName, unlockKey) {
    if (!email) return;
    const unlockLink = SITE_URL + '/unlock/' + unlockKey;
    const attachments = loadPdfAttachments(productKey);
    const isFounder = productKey === 'founderpass';

    const html = `
<div style="font-family: 'Open Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; color: #1F3A5F;">
    <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: linear-gradient(135deg, #F4D03F, #FFB800); color: #1F3A5F; font-weight: 900; font-size: 12px; letter-spacing: 1.5px; padding: 6px 16px; border-radius: 50px;">
            ${isFounder ? '&#10024; FOUNDER FAMILY' : '&#9992;&#65039; THE TRAVEL LAB ACADEMY'}
        </div>
    </div>
    <h1 style="font-family: 'Montserrat', Arial, sans-serif; font-weight: 900; font-size: 26px; color: #1F3A5F; text-align: center; margin: 0 0 12px;">
        Welcome to ${productName}!
    </h1>
    <p style="font-size: 16px; line-height: 1.6; text-align: center; color: #1F3A5F; margin: 0 0 28px;">
        ${isFounder
            ? "Thank you for being one of our first 100 Founder Families. Your adventure starts here."
            : "Thank you for unlocking your adventure pack. Time to explore, design, invent and discover."}
    </p>
    <div style="background: #f8f9fc; border-left: 4px solid #E91E8C; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px;">
        <p style="font-weight: 700; color: #1F3A5F; margin: 0 0 8px;">Your personal unlock link:</p>
        <p style="margin: 0;"><a href="${unlockLink}" style="color: #1A8FE3; word-break: break-all;">${unlockLink}</a></p>
        <p style="font-size: 13px; color: #5a6c8a; margin: 12px 0 0;">Open it on any device to start playing. Works on phones, tablets and laptops. No password.</p>
    </div>
    ${attachments.length > 0 ? `
    <div style="background: #fff8dc; border: 1px solid #F4D03F; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px;">
        <p style="font-weight: 700; color: #1F3A5F; margin: 0 0 6px;">&#128196; Printable PDF attached</p>
        <p style="font-size: 14px; color: #1F3A5F; margin: 0;">${attachments.length === 1 ? 'Your printable adventure pack is attached to this email.' : 'Your ' + attachments.length + ' printable adventure packs are attached to this email.'} Print, frame, take on holiday.</p>
    </div>` : ''}
    ${isFounder ? `
    <div style="background: #fef3f8; border: 1px solid #E91E8C; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px;">
        <p style="font-weight: 700; color: #1F3A5F; margin: 0 0 6px;">&#128221; A small ask, Founder Family</p>
        <p style="font-size: 14px; color: #1F3A5F; margin: 0;">After your explorer plays, tell us what made them smile and what we should build next. Your feedback shapes the Academy.</p>
    </div>` : ''}
    <p style="text-align: center; font-family: 'Montserrat', Arial, sans-serif; font-weight: 700; color: #E91E8C; letter-spacing: 3px; font-size: 13px; margin: 32px 0 8px;">
        DREAM &nbsp; DISCOVER &nbsp; BECOME
    </p>
    <p style="text-align: center; font-size: 12px; color: #5a6c8a; margin: 0;">
        The Travel Lab Academy by C442 Apps
    </p>
</div>`;

    try {
        const emailPayload = {
            from: FROM_EMAIL,
            to: email,
            subject: 'Your Travel Lab Academy ' + productName + ' is ready',
            html: html,
        };
        if (attachments.length > 0) {
            emailPayload.attachments = attachments;
        }
        await resend.emails.send(emailPayload);
        console.log('Welcome email sent to', email, 'with', attachments.length, 'attachment(s)');
    } catch (err) {
        console.error('Resend email failed:', err);
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
        const email = (session.customer_details && session.customer_details.email) || session.customer_email;

        const unlockKey = generateUnlockKey(productKey);

        await storeKey(unlockKey, {
            product: productKey,
            productName: productName,
            email: email || null,
            created: new Date().toISOString(),
        });

        await sendConfirmationEmail(email, productKey, productName, unlockKey);
        console.log('Unlock key created:', unlockKey, 'for', email);
    }

    return res.status(200).json({ received: true });
};

module.exports.config = {
    api: { bodyParser: false },
};
