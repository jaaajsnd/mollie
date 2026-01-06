require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || 'live_c7FxsSRcwDR5b4ft3Gz6a4c3zV5m6w';
const MOLLIE_BASE_URL = 'https://api.mollie.com/v2';
const APP_URL = process.env.APP_URL || 'http://localhost:10000';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const pendingOrders = new Map();

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Telegram error:', error.message);
  }
}

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
    return res.status(400).send('Verplichte parameters ontbreken');
  }

  let cartData = null;
  if (cart_items) {
    try {
      cartData = typeof cart_items === 'string' ? JSON.parse(cart_items) : cart_items;
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
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7f7f7; color: #333; line-height: 1.6; }
          .checkout-container { display: flex; min-height: 100vh; }
          .order-summary { width: 50%; background: #fafafa; padding: 60px 80px; border-right: 1px solid #e1e1e1; }
          .cart-items { margin-bottom: 30px; }
          .cart-item { display: flex; gap: 15px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e1e1e1; }
          .item-image { width: 64px; height: 64px; background: #e1e1e1; border-radius: 8px; position: relative; }
          .item-quantity { position: absolute; top: -8px; right: -8px; background: #717171; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
          .item-details { flex: 1; }
          .item-name { font-weight: 500; font-size: 14px; }
          .item-price { font-weight: 500; font-size: 14px; }
          .summary-section { padding: 20px 0; border-top: 1px solid #e1e1e1; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
          .summary-row.total { font-size: 18px; font-weight: 600; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e1e1e1; }
          .payment-form { width: 50%; background: white; padding: 60px 80px; }
          .breadcrumb { font-size: 13px; color: #717171; margin-bottom: 30px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
          .form-group { margin-bottom: 12px; }
          label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
          input { width: 100%; padding: 12px 14px; border: 1px solid #d9d9d9; border-radius: 5px; font-size: 14px; }
          input:focus { outline: none; border-color: #2c6ecb; }
          .form-row { display: flex; gap: 12px; }
          .form-row .form-group { flex: 1; }
          .pay-button { width: 100%; padding: 18px; background: #2c6ecb; color: white; border: none; border-radius: 5px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 24px; }
          .pay-button:hover { background: #1f5bb5; }
          .pay-button:disabled { background: #d9d9d9; cursor: not-allowed; }
          .error { background: #fff4f4; border: 1px solid #ffcdd2; color: #c62828; padding: 12px 16px; border-radius: 5px; margin: 16px 0; display: none; }
          .loading { display: none; text-align: center; padding: 16px; color: #717171; }
          @media (max-width: 1000px) { .checkout-container { flex-direction: column-reverse; } .order-summary, .payment-form { width: 100%; padding: 30px 20px; } }
        </style>
      </head>
      <body>
        <div class="checkout-container">
          <div class="order-summary">
            <div class="cart-items" id="cart-items"></div>
            <div class="summary-section">
              <div class="summary-row"><span>Subtotaal</span><span>€${amount}</span></div>
              <div class="summary-row"><span>Verzending</span><span>Gratis</span></div>
              <div class="summary-row total"><span>Totaal</span><span>€${amount}</span></div>
            </div>
          </div>
          <div class="payment-form">
            <div class="breadcrumb">Winkelwagen › Informatie › <strong>Betaling</strong></div>
            <div id="error-message" class="error"></div>
            <div id="loading-message" class="loading">Betaling verwerken...</div>
            <div class="section">
              <div class="section-title">Contact</div>
              <div class="form-group"><label for="email">E-mailadres</label><input type="email" id="email" required></div>
            </div>
            <div class="section">
              <div class="section-title">Bezorgadres</div>
              <div class="form-row">
                <div class="form-group"><label for="firstName">Voornaam</label><input type="text" id="firstName" required></div>
                <div class="form-group"><label for="lastName">Achternaam</label><input type="text" id="lastName" required></div>
              </div>
              <div class="form-group"><label for="address">Adres</label><input type="text" id="address" required></div>
              <div class="form-row">
                <div class="form-group"><label for="postalCode">Postcode</label><input type="text" id="postalCode" required></div>
                <div class="form-group"><label for="city">Plaats</label><input type="text" id="city" required></div>
              </div>
            </div>
            <button class="pay-button" onclick="startPayment()">Afrekenen</button>
          </div>
        </div>
        <script>
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};

          function displayCartItems() {
            const container = document.getElementById('cart-items');
            if (!cartData || !cartData.items) {
              container.innerHTML = '<p>Geen producten</p>';
              return;
            }
            container.innerHTML = cartData.items.map(item => \`
              <div class="cart-item">
                <div class="item-image"><div class="item-quantity">\${item.quantity}</div></div>
                <div class="item-details"><div class="item-name">\${item.title || item.product_title}</div></div>
                <div class="item-price">€\${(item.price / 100).toFixed(2)}</div>
              </div>
            \`).join('');
          }

          displayCartItems();

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
                body: JSON.stringify({ amount: '${amount}', currency: '${currency}', customerData, cartData, orderId: '${order_id || ''}', returnUrl: '${return_url || ''}' })
              });
              const data = await response.json();
              if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
              } else {
                throw new Error('Kon betaling niet starten');
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
  try {
    const { amount, currency, customerData, cartData, orderId, returnUrl } = req.body;

    const paymentData = {
      amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) },
      description: `Bestelling ${orderId || Date.now()}`,
      redirectUrl: `${APP_URL}/payment/return?order_id=${orderId || ''}&return_url=${encodeURIComponent(returnUrl)}`,
      webhookUrl: `${APP_URL}/webhook/mollie`,
      locale: 'nl_NL',
      metadata: { 
        order_id: orderId || '', 
        customer_email: customerData.email, 
        customer_name: `${customerData.firstName} ${customerData.lastName}`,
        cart_data: JSON.stringify(cartData)
      }
    };

    const response = await axios.post(`${MOLLIE_BASE_URL}/payments`, paymentData, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' }
    });

    const payment = response.data;
    pendingOrders.set(payment.id, { orderId, customerData, cartData, returnUrl, created_at: new Date() });

    res.json({ status: 'success', checkoutUrl: payment._links.checkout.href });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/payment/return', (req, res) => {
  const { return_url } = req.query;
  res.send(`<html><head><title>Betaling</title><style>body{font-family:Arial;text-align:center;padding:50px;background:#f5f5f5}.box{background:white;padding:40px;border-radius:10px;max-width:500px;margin:0 auto}.spinner{border:4px solid #f3f3f3;border-top:4px solid #000;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></head><body><div class="box"><div class="spinner"></div><h1>Betaling controleren...</h1></div><script>setTimeout(()=>{window.location.href='${return_url || '/'}'},3000);</script></body></html>`);
});

app.post('/webhook/mollie', async (req, res) => {
  try {
    const { id } = req.body;
    const response = await axios.get(`${MOLLIE_BASE_URL}/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    const payment = response.data;
    
    if (payment.status === 'paid') {
      const customerName = payment.metadata?.customer_name || 'Onbekend';
      const customerEmail = payment.metadata?.customer_email || 'Onbekend';
      const amount = payment.amount.value;
      
      let productsText = '';
      if (payment.metadata?.cart_data) {
        try {
          const cartData = JSON.parse(payment.metadata.cart_data);
          if (cartData && cartData.items && cartData.items.length > 0) {
            productsText = '\n\n<b>🛒 Producten:</b>\n';
            cartData.items.forEach(item => {
              const itemPrice = (item.line_price || (item.price * item.quantity)) / 100;
              productsText += `• ${item.quantity}x ${item.title} - €${itemPrice.toFixed(2)}\n`;
            });
          }
        } catch (e) {
          console.error('Error parsing cart data:', e);
        }
      }
      
      const message = `
<b>✅ BETALING ONTVANGEN - MOLLIE</b>

<b>💰 Bedrag:</b> €${amount}
<b>👤 Klant:</b> ${customerName}
<b>📧 Email:</b> ${customerEmail}
<b>🆔 Payment ID:</b> ${id}${productsText}

<b>✓ Status:</b> Betaald
      `.trim();
      
      await sendTelegramMessage(message);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
