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
const APP_URL = process.env.APP_URL;

const pendingOrders = new Map();

app.get('/', (req, res) => {
  res.json({ status: 'active', message: 'Running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/checkout', async (req, res) => {
  const { amount, currency, cart_items } = req.body;
  let cartData = null;
  let finalAmount = '0.00';
  
  if (cart_items) {
    try {
      cartData = typeof cart_items === 'string' ? JSON.parse(cart_items) : cart_items;
      if (cartData.total) {
        finalAmount = (cartData.total / 100).toFixed(2);
      }
    } catch (e) {
      console.error('Error parsing cart_items:', e);
    }
  }
  
  if (finalAmount === '0.00' && amount) {
    finalAmount = parseFloat(amount).toFixed(2);
  }

  let cartItemsHtml = '';
  if (cartData && cartData.items) {
    cartItemsHtml = cartData.items.map(item => {
      const linePrice = item.line_price ? (item.line_price / 100).toFixed(2) : ((item.price * item.quantity) / 100).toFixed(2);
      return `
        <div class="cart-item">
          <div class="item-image">
            <div class="item-quantity">${item.quantity}</div>
          </div>
          <div class="item-details">
            <div class="item-name">${item.title || item.product_title}</div>
          </div>
          <div class="item-price">€${linePrice}</div>
        </div>
      `;
    }).join('');
  }

  res.send(`
    <html>
      <head>
        <title>Afrekenen - €${finalAmount}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7f7f7; color: #333; }
          .checkout-container { display: flex; min-height: 100vh; }
          .order-summary { width: 50%; background: #fafafa; padding: 60px 80px; border-right: 1px solid #e1e1e1; }
          .payment-form { width: 50%; background: white; padding: 60px 80px; }
          .logo { font-size: 24px; font-weight: bold; margin-bottom: 40px; }
          .cart-items { margin-bottom: 30px; }
          .cart-item { display: flex; gap: 15px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e1e1e1; }
          .item-image { width: 64px; height: 64px; background: #e1e1e1; border-radius: 8px; position: relative; }
          .item-quantity { position: absolute; top: -8px; right: -8px; background: #717171; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
          .item-details { flex: 1; }
          .item-name { font-weight: 500; font-size: 14px; }
          .item-price { font-weight: 500; font-size: 14px; }
          .summary-section { padding: 20px 0; border-top: 1px solid #e1e1e1; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
          .summary-row.total { font-size: 18px; font-weight: 600; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e1e1e1; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
          .form-group { margin-bottom: 12px; }
          label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
          input { width: 100%; padding: 12px 14px; border: 1px solid #d9d9d9; border-radius: 5px; font-size: 14px; }
          input:focus { outline: none; border-color: #2c6ecb; }
          .form-row { display: flex; gap: 12px; }
          .form-row .form-group { flex: 1; }
          .payment-methods { margin-top: 16px; }
          .payment-method { display: flex; align-items: center; padding: 14px 16px; border: 2px solid #d9d9d9; border-radius: 8px; margin-bottom: 12px; cursor: pointer; }
          .payment-method:hover { border-color: #2c6ecb; }
          .payment-method.selected { border-color: #2c6ecb; background: #f0f7ff; }
          .payment-method input { width: 18px; height: 18px; margin-right: 12px; }
          .payment-method-logo { font-size: 24px; margin-right: 12px; }
          .pay-button { width: 100%; padding: 18px; background: #2c6ecb; color: white; border: none; border-radius: 5px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 24px; }
          .pay-button:hover { background: #1f5bb5; }
          .error { background: #fff4f4; border: 1px solid #ffcdd2; color: #c62828; padding: 12px 16px; border-radius: 5px; margin: 16px 0; display: none; }
          .loading { display: none; text-align: center; padding: 16px; }
          @media (max-width: 1000px) { .checkout-container { flex-direction: column-reverse; } .order-summary, .payment-form { width: 100%; padding: 30px 20px; } }
        </style>
      </head>
      <body>
        <div class="checkout-container">
          <div class="order-summary">
            <div class="cart-items">${cartItemsHtml || '<p>Geen producten</p>'}</div>
            <div class="summary-section">
              <div class="summary-row"><span>Subtotaal</span><span>€${finalAmount}</span></div>
              <div class="summary-row"><span>Verzending</span><span>Gratis</span></div>
              <div class="summary-row total"><span>Totaal</span><span>€${finalAmount}</span></div>
            </div>
          </div>
          <div class="payment-form">
            <div id="error-message" class="error"></div>
            <div id="loading-message" class="loading">Betaling verwerken...</div>
            <div class="section">
              <div class="section-title">Contact</div>
              <div class="form-group">
                <label for="email">E-mailadres</label>
                <input type="email" id="email" required>
              </div>
            </div>
            <div class="section">
              <div class="section-title">Bezorgadres</div>
              <div class="form-row">
                <div class="form-group">
                  <label for="firstName">Voornaam</label>
                  <input type="text" id="firstName" required>
                </div>
                <div class="form-group">
                  <label for="lastName">Achternaam</label>
                  <input type="text" id="lastName" required>
                </div>
              </div>
              <div class="form-group">
                <label for="address">Adres</label>
                <input type="text" id="address" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="postalCode">Postcode</label>
                  <input type="text" id="postalCode" required>
                </div>
                <div class="form-group">
                  <label for="city">Plaats</label>
                  <input type="text" id="city" required>
                </div>
              </div>
            </div>
            <div class="section">
              <div class="section-title">Betaalmethode</div>
              <div class="payment-methods">
                <label class="payment-method selected" onclick="selectMethod('ideal')">
                  <input type="radio" name="payment-method" value="ideal" checked>
                  <span class="payment-method-logo">🏦</span>
                  <span>iDEAL</span>
                </label>
                <label class="payment-method" onclick="selectMethod('creditcard')">
                  <input type="radio" name="payment-method" value="creditcard">
                  <span class="payment-method-logo">💳</span>
                  <span>Creditcard</span>
                </label>
              </div>
            </div>
            <button class="pay-button" onclick="startPayment()">Nu betalen</button>
          </div>
        </div>
        <script>
          let selectedMethod = 'ideal';
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};

          function selectMethod(method) {
            selectedMethod = method;
            document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
          }

          async function startPayment() {
            const customerData = {
              firstName: document.getElementById('firstName').value.trim(),
              lastName: document.getElementById('lastName').value.trim(),
              email: document.getElementById('email').value.trim(),
              address: document.getElementById('address').value.trim(),
              postalCode: document.getElementById('postalCode').value.trim(),
              city: document.getElementById('city').value.trim()
            };
            
            if (!customerData.firstName || !customerData.email) {
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = 'Vul alle velden in';
              return;
            }

            document.getElementById('loading-message').style.display = 'block';
            document.querySelector('.pay-button').disabled = true;

            try {
              const response = await fetch('/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  amount: '${finalAmount}',
                  currency: 'EUR',
                  method: selectedMethod,
                  customerData: customerData,
                  cartData: cartData
                })
              });

              const data = await response.json();
              if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
              } else {
                throw new Error('Geen checkout URL');
              }
            } catch (error) {
              document.getElementById('loading-message').style.display = 'none';
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = error.message;
              document.querySelector('.pay-button').disabled = false;
            }
          }
        </script>
      </body>
    </html>
  `);
});

app.post('/api/create-payment', async (req, res) => {
  const { amount, currency, method, customerData, cartData } = req.body;
  
  try {
    const response = await axios.post(`${MOLLIE_BASE_URL}/payments`, {
      amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) },
      description: 'Bestelling ' + Date.now(),
      redirectUrl: `${APP_URL}/payment/return`,
      webhookUrl: `${APP_URL}/webhook/mollie`,
      profileId: MOLLIE_PROFILE_ID,
      metadata: { customer_email: customerData.email }
    }, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    res.json({ status: 'success', checkoutUrl: response.data._links.checkout.href });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/payment/return', (req, res) => {
  res.send('<html><head><title>Betaling</title></head><body><h1>Betaling succesvol!</h1><p>Bedankt voor je bestelling</p></body></html>');
});

app.post('/webhook/mollie', (req, res) => {
  console.log('Mollie webhook:', req.body);
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
