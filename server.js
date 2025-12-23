require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || 'live_8QWfNuBJJH6EEwSfjpnSbvJFeUdWAV';
const MOLLIE_PROFILE_ID = process.env.MOLLIE_PROFILE_ID || 'pfl_w8n5EDzydi';
const MOLLIE_BASE_URL = 'https://api.mollie.com/v2';
const APP_URL = process.env.APP_URL || 'http://localhost:10000';

const pendingOrders = new Map();

app.get('/', (req, res) => {
  res.json({ status: 'active', message: 'Running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

function generateCheckoutHTML(cartData, finalAmount, currency, order_id, return_url, sessionId) {
  let cartItemsHtml = '';
  if (cartData && cartData.items && cartData.items.length > 0) {
    cartItemsHtml = cartData.items.map(item => {
      const linePrice = item.line_price ? (item.line_price / 100).toFixed(2) : ((item.price * item.quantity) / 100).toFixed(2);
      return `<div style="display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid #e1e3e5;"><div style="display:flex;gap:12px;"><span style="width:20px;height:20px;background:#c9cccf;color:white;border-radius:50%;font-size:12px;display:flex;align-items:center;justify-content:center;">${item.quantity}</span><span>${item.title}</span></div><span>€${linePrice}</span></div>`;
    }).join('');
  }
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CHECKOUT</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#fafafa;color:#202223}.container{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;min-height:100vh}@media(max-width:768px){.container{grid-template-columns:1fr}}.checkout-form{padding:60px 80px;background:white}@media(max-width:768px){.checkout-form{padding:30px 20px}}.logo{font-size:24px;font-weight:600;margin-bottom:40px}h1{font-size:26px;font-weight:600;margin-bottom:24px}.form-group{margin-bottom:16px}label{display:block;font-size:13px;font-weight:500;margin-bottom:8px}input{width:100%;padding:11px 12px;border:1px solid #c9cccf;border-radius:5px;font-size:14px}input:focus{outline:none;border-color:#2c6ecb}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:480px){.form-row{grid-template-columns:1fr}}.submit-button{width:100%;padding:16px 24px;background:#2c6ecb;color:white;border:none;border-radius:5px;font-size:15px;font-weight:600;cursor:pointer;margin-top:24px}.submit-button:hover{background:#1f5bb5}.order-summary{padding:60px 80px;background:#fafafa;border-left:1px solid #e1e3e5}@media(max-width:768px){.order-summary{padding:30px 20px;border-left:none}}.waiting{text-align:center;padding:60px 20px;display:none}.spinner{border:3px solid #f3f3f3;border-top:3px solid #2c6ecb;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></head><body><div class="container"><div class="checkout-form"><div id="form-container"><div class="logo">CHECKOUT</div><h1>Contact</h1><form id="customer-form"><div class="form-group"><label for="email">E-mail</label><input type="email" id="email" required></div><div class="form-row"><div class="form-group"><label for="firstName">Voornaam</label><input type="text" id="firstName" required></div><div class="form-group"><label for="lastName">Achternaam</label><input type="text" id="lastName" required></div></div><div class="form-group"><label for="address">Adres</label><input type="text" id="address" required></div><div class="form-row"><div class="form-group"><label for="city">Plaats</label><input type="text" id="city" required></div><div class="form-group"><label for="postalCode">Postcode</label><input type="text" id="postalCode" required></div></div><div class="form-group"><label for="country">Land</label><input type="text" id="country" value="Nederland" required></div><div class="form-group"><label for="phone">Telefoon</label><input type="tel" id="phone" required></div><button type="submit" class="submit-button">Doorgaan naar betaling</button></form></div><div id="waiting-container" class="waiting"><div class="spinner"></div><div>Betaling verwerken...</div></div></div><div class="order-summary"><h2>Overzicht</h2>${cartItemsHtml}<div style="margin-top:24px;"><div style="display:flex;justify-content:space-between;padding:12px 0;"><span>Subtotaal</span><span>€${finalAmount}</span></div><div style="display:flex;justify-content:space-between;padding:12px 0;border-top:1px solid #e1e3e5;margin-top:16px;font-size:16px;font-weight:600;"><span>Totaal</span><span>€${finalAmount}</span></div></div></div></div><script>const sessionId='${sessionId}';document.getElementById('customer-form').addEventListener('submit',async(e)=>{e.preventDefault();const customerData={firstName:document.getElementById('firstName').value,lastName:document.getElementById('lastName').value,email:document.getElementById('email').value,phone:document.getElementById('phone').value,address:document.getElementById('address').value,postalCode:document.getElementById('postalCode').value,city:document.getElementById('city').value,country:document.getElementById('country').value};document.getElementById('form-container').style.display='none';document.getElementById('waiting-container').style.display='block';const res=await fetch('/api/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,customerData,amount:'${finalAmount}',currency:'EUR'})});const data=await res.json();if(data.checkoutUrl){window.location.href=data.checkoutUrl}});</script></body></html>`;
}

app.post('/checkout', (req, res) => {
  const { amount, currency, cart_items } = req.body;
  let cartData = null;
  let finalAmount = '0.00';
  if (cart_items) {
    cartData = typeof cart_items === 'string' ? JSON.parse(cart_items) : cart_items;
    if (cartData.total) {
      finalAmount = (cartData.total / 100).toFixed(2);
    }
  }
  if (finalAmount === '0.00' && amount) {
    finalAmount = parseFloat(amount).toFixed(2);
  }
  const sessionId = Date.now().toString();
  const html = generateCheckoutHTML(cartData, finalAmount, currency, '', '', sessionId);
  res.send(html);
});

app.post('/api/create-payment', async (req, res) => {
  const { sessionId, customerData, amount, currency } = req.body;
  try {
    const response = await axios.post(`${MOLLIE_BASE_URL}/payments`, {
      amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) },
      description: `Bestelling ${sessionId}`,
      redirectUrl: `${APP_URL}/payment/return?session=${sessionId}`,
      webhookUrl: `${APP_URL}/webhook/mollie`,
      profileId: MOLLIE_PROFILE_ID,
      metadata: { session_id: sessionId, customer_email: customerData.email }
    }, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    pendingOrders.set(sessionId, { paymentId: response.data.id, customerData, amount, created_at: new Date() });
    res.json({ status: 'success', checkoutUrl: response.data._links.checkout.href });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/payment/return', (req, res) => {
  res.send(`<html><head><title>Betaling</title><style>body{font-family:Arial;text-align:center;padding:50px;background:#f5f5f5}.box{background:white;padding:40px;border-radius:10px;max-width:500px;margin:0 auto}h1{color:#4caf50}</style></head><body><div class="box"><h1>Betaling succesvol</h1><p>Bedankt voor je bestelling</p></div></body></html>`);
});

app.post('/webhook/mollie', async (req, res) => {
  console.log('Mollie webhook:', req.body);
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
