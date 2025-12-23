require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || 'live_8QWfNuBJJH6EEwSfjpnSbvJFeUdWAV';
const MOLLIE_PROFILE_ID = process.env.MOLLIE_PROFILE_ID || 'pfl_w8n5EDzydi';
const MOLLIE_BASE_URL = 'https://api.mollie.com/v2';
const APP_URL = process.env.APP_URL || 'http://localhost:10000';

const pendingOrders = new Map();

app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'Shopify-Mollie Payment Gateway is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url, cart_items } = req.body;
  
  if (!amount || !currency) {
    return res.status(400).send('Verplichte parameters ontbreken: bedrag en valuta');
  }

  let cartData = null;
  if (cart_items) {
    try {
      cartData = typeof cart_items === 'string' ? JSON.parse(cart_items) : cart_items;
      console.log('Cart data ontvangen:', cartData);
    } catch (e) {
      console.error('Error parsing cart_items:', e);
    }
  }

  res.send(`
    <html>
      <head>
        <title>Afrekenen - €${amount}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif; background: #f7f7f7; color: #333; line-height: 1.6; }
          .checkout-container { display: flex; min-height: 100vh; }
          .order-summary { width: 50%; background: #fafafa; padding: 60px 80px; border-right: 1px solid #e1e1e1; }
          .logo { font-size: 24px; font-weight: bold; margin-bottom: 40px; color: #000; }
          .cart-items { margin-bottom: 30px; }
          .cart-item { display: flex; gap: 15px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e1e1e1; }
          .cart-item:last-child { border-bottom: none; }
          .item-image { width: 64px; height: 64px; background: #e1e1e1; border-radius: 8px; position: relative; }
          .item-quantity { position: absolute; top: -8px; right: -8px; background: #717171; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
          .item-details { flex: 1; }
          .item-name { font-weight: 500; font-size: 14px; margin-bottom: 4px; }
          .item-variant { font-size: 13px; color: #717171; }
          .item-price { font-weight: 500; font-size: 14px; }
          .summary-section { padding: 20px 0; border-top: 1px solid #e1e1e1; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
          .summary-row.total { font-size: 18px; font-weight: 600; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e1e1e1; }
          .payment-form { width: 50%; background: white; padding: 60px 80px; }
          .breadcrumb { font-size: 13px; color: #717171; margin-bottom: 30px; }
          .breadcrumb a { color: #2c6ecb; text-decoration: none; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
          .form-group { margin-bottom: 12px; }
          label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #333; }
          input { width: 100%; padding: 12px 14px; border: 1px solid #d9d9d9; border-radius: 5px; font-size: 14px; font-family: inherit; transition: border 0.2s; }
          input:focus { outline: none; border-color: #2c6ecb; box-shadow: 0 0 0 3px rgba(44, 110, 203, 0.1); }
          .form-row { display: flex; gap: 12px; }
          .form-row .form-group { flex: 1; }
          .payment-methods { margin-top: 16px; }
          .payment-method { display: flex; align-items: center; padding: 14px 16px; border: 2px solid #d9d9d9; border-radius: 8px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s; background: white; }
          .payment-method:hover { border-color: #2c6ecb; }
          .payment-method.selected { border-color: #2c6ecb; background: #f0f7ff; }
          .payment-method input[type="radio"] { width: 18px; height: 18px; margin-right: 12px; cursor: pointer; }
          .payment-method-content { display: flex; align-items: center; flex: 1; }
          .payment-method-logo { font-size: 24px; margin-right: 12px; }
          .payment-method-name { font-weight: 500; font-size: 14px; }
          .pay-button { width: 100%; padding: 18px; background: #2c6ecb; color: white; border: none; border-radius: 5px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 24px; transition: background 0.2s; }
          .pay-button:hover { background: #1f5bb5; }
          .pay-button:disabled { background: #d9d9d9; cursor: not-allowed; }
          .secure-badge { text-align: center; color: #717171; font-size: 12px; margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 6px; }
          .error { background: #fff4f4; border: 1px solid #ffcdd2; color: #c62828; padding: 12px 16px; border-radius: 5px; margin: 16px 0; display: none; font-size: 14px; }
          .loading { display: none; text-align: center; padding: 16px; color: #717171; font-size: 14px; }
          @media (max-width: 1000px) { .checkout-container { flex-direction: column-reverse; } .order-summary, .payment-form { width: 100%; padding: 30px 20px; } .order-summary { border-right: none; border-top: 1px solid #e1e1e1; } }
        </style>
      </head>
      <body>
        <div class="checkout-container">
          <div class="order-summary">
            <div class="cart-items" id="cart-items"></div>
            <div class="summary-section">
              <div class="summary-row"><span>Subtotaal</span><span id="subtotal">€${amount}</span></div>
              <div class="summary-row"><span>Verzending</span><span>Gratis</span></div>
              <div class="summary-row total"><span>Totaal</span><span>EUR <strong id="total">€${amount}</strong></span></div>
            </div>
          </div>
          <div class="payment-form">
            <div class="breadcrumb"><a href="#">Winkelwagen</a> › <a href="#">Informatie</a> › <strong>Betaling</strong></div>
            <div id="error-message" class="error"></div>
            <div id="loading-message" class="loading">Betaling verwerken...</div>
            <div class="section">
              <div class="section-title">Contact</div>
              <div class="form-group"><label for="email">E-mailadres</label><input type="email" id="email" placeholder="jan@voorbeeld.nl" required></div>
            </div>
            <div class="section">
              <div class="section-title">Bezorgadres</div>
              <div class="form-row">
                <div class="form-group"><label for="firstName">Voornaam</label><input type="text" id="firstName" placeholder="Jan" required></div>
                <div class="form-group"><label for="lastName">Achternaam</label><input type="text" id="lastName" placeholder="Jansen" required></div>
              </div>
              <div class="form-group"><label for="address">Adres</label><input type="text" id="address" placeholder="Hoofdstraat 123" required></div>
              <div class="form-row">
                <div class="form-group"><label for="postalCode">Postcode</label><input type="text" id="postalCode" placeholder="1234 AB" required></div>
                <div class="form-group"><label for="city">Plaats</label><input type="text" id="city" placeholder="Amsterdam" required></div>
              </div>
            </div>
            <div class="section">
              <div class="section-title">Betaalmethode</div>
              <div class="payment-methods">
                <label class="payment-method selected" onclick="selectMethod('ideal')"><input type="radio" name="payment-method" value="ideal" checked><div class="payment-method-content"><span class="payment-method-logo">🏦</span><span class="payment-method-name">iDEAL</span></div></label>
                <label class="payment-method" onclick="selectMethod('creditcard')"><input type="radio" name="payment-method" value="creditcard"><div class="payment-method-content"><span class="payment-method-logo">💳</span><span class="payment-method-name">Creditcard</span></div></label>
                <label class="payment-method" onclick="selectMethod('bancontact')"><input type="radio" name="payment-method" value="bancontact"><div class="payment-method-content"><span class="payment-method-logo">🇧🇪</span><span class="payment-method-name">Bancontact</span></div></label>
              </div>
            </div>
            <button class="pay-button" onclick="startPayment()">Nu betalen</button>
            <div class="secure-badge"><svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><path d="M6 0L0 2v5c0 3.7 2.5 7.1 6 8 3.5-.9 6-4.3 6-8V2L6 0zm0 12.9c-2.9-.8-5-3.7-5-6.9V3.1l5-1.7 5 1.7v2.9c0 3.2-2.1 6.1-5 6.9z"/></svg>Alle transacties zijn beveiligd en versleuteld</div>
          </div>
        </div>
        <script>
          let selectedMethod = 'ideal';
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};

          function displayCartItems() {
            const container = document.getElementById('cart-items');
            if (!cartData || !cartData.items) {
              container.innerHTML = '<p style="color: #717171;">Geen producten</p>';
              return;
            }
            container.innerHTML = cartData.items.map(item => \`
              <div class="cart-item">
                <div class="item-image"><div class="item-quantity">\${item.quantity}</div></div>
                <div class="item-details"><div class="item-name">\${item.title || item.product_title}</div><div class="item-variant">\${item.variant_title || ''}</div></div>
                <div class="item-price">€\${(item.price / 100).toFixed(2)}</div>
              </div>
            \`).join('');
          }

          displayCartItems();

          function selectMethod(method) {
            selectedMethod = method;
            document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
          }

          function validateCustomerInfo() {
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const email = document.getElementById('email').value.trim();
            const address = document.getElementById('address').value.trim();
            const postalCode = document.getElementById('postalCode').value.trim();
            const city = document.getElementById('city').value.trim();
            if (!firstName || !lastName || !email || !address || !postalCode || !city) return false;
            return { firstName, lastName, email, address, postalCode, city };
          }

          async function startPayment() {
            const customerData = validateCustomerInfo();
            if (!customerData) {
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ Vul alle verplichte velden in';
              return;
            }
            document.getElementById('loading-message').style.display = 'block';
            document.querySelector('.pay-button').disabled = true;
            try {
              const response = await fetch('/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: '${amount}', currency: '${currency}', method: selectedMethod, customerData: customerData, cartData: cartData, orderId: '${order_id || ''}', returnUrl: '${return_url || APP_URL}' })
              });
              const data = await response.json();
              if (data.status === 'success' && data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
              } else {
                throw new Error(data.message || 'Betaling kon niet worden gestart');
              }
            } catch (error) {
              console.error('Error:', error);
              document.getElementById('loading-message').style.display = 'none';
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ ' + error.message;
              document.querySelector('.pay-button').disabled = false;
            }
          }

          document.querySelectorAll('.payment-method').forEach(el => {
            el.addEventListener('click', function() { this.querySelector('input[type="radio"]').checked = true; });
          });
        </script>
      </body>
    </html>
  `);
});

app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, currency, method, customerData, cartData, orderId, returnUrl } = req.body;
    console.log('Creating Mollie payment:', { amount, currency, method });

    const paymentData = {
      amount: { currency: currency.toUpperCase(), value: parseFloat(amount).toFixed(2) },
      description: `Bestelling ${orderId || Date.now()}`,
      redirectUrl: `${APP_URL}/payment/return?order_id=${orderId || ''}&return_url=${encodeURIComponent(returnUrl)}`,
      webhookUrl: `${APP_URL}/webhook/mollie`,
      profileId: MOLLIE_PROFILE_ID,
      metadata: { order_id: orderId || '', customer_email: customerData.email, customer_name: `${customerData.firstName} ${customerData.lastName}` }
    };

    if (method && method !== 'creditcard') paymentData.method = method;

    const response = await axios.post(`${MOLLIE_BASE_URL}/payments`, paymentData, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' }
    });

    const payment = response.data;
    pendingOrders.set(payment.id, { orderId, customerData, cartData, returnUrl, created_at: new Date() });

    res.json({ status: 'success', paymentId: payment.id, checkoutUrl: payment._links.checkout.href });
  } catch (error) {
    console.error('Error creating payment:', error.message);
    res.status(500).json({ status: 'error', message: error.message, details: error.response?.data });
  }
});

app.get('/payment/return', async (req, res) => {
  const { order_id, return_url } = req.query;
  res.send(`<html><head><title>Betaling Verwerken</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:50px;background:#f5f5f5}.box{background:white;padding:40px;border-radius:10px;max-width:500px;margin:0 auto;box-shadow:0 2px 10px rgba(0,0,0,0.1)}.spinner{border:4px solid #f3f3f3;border-top:4px solid #000;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}h1{color:#333}p{color:#666}</style></head><body><div class="box"><div class="spinner"></div><h1>Betaling controleren...</h1><p>Een moment geduld, we controleren de status van je betaling.</p></div><script>setTimeout(()=>{window.location.href='${return_url || '/'}'},3000);</script></body></html>`);
});

app.post('/webhook/mollie', async (req, res) => {
  try {
    const { id } = req.body;
    console.log('Mollie webhook received for payment:', id);
    const response = await axios.get(`${MOLLIE_BASE_URL}/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    const payment = response.data;
    console.log('Payment status:', payment.status);
    if (payment.status === 'paid') console.log('✅ Payment successful:', id);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 App URL: ${APP_URL}`);
  console.log(`✅ Mollie API configured`);
  console.log(`🔗 Checkout URL: ${APP_URL}/checkout`);
});
