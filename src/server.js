require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || 'live_hPsaMzWV92ufHVSdrJVCs7UUBjj4Hz';
const MOLLIE_BASE_URL = 'https://api.mollie.com/v2';
const APP_URL = process.env.APP_URL || 'http://localhost:10000';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const pendingOrders = new Map();

const translations = {
  nl: {
    title: 'Afrekenen',
    customer_info: 'Klantinformatie',
    first_name: 'Voornaam',
    last_name: 'Achternaam',
    email: 'E-mailadres',
    phone: 'Telefoonnummer',
    billing_address: 'Verzendadres',
    address: 'Adres',
    postal_code: 'Postcode',
    city: 'Plaats',
    subtotal: 'Subtotaal',
    shipping: 'Verzending',
    total: 'Totaal',
    free: 'Gratis',
    complete_order: 'Bestelling afronden',
    processing: 'Verwerken...',
    checking: 'Betaling controleren...',
    locale: 'nl_NL',
    currency: 'EUR',
    symbol: '€'
  },
  es: {
    title: 'Finalizar Compra',
    customer_info: 'Información del Cliente',
    first_name: 'Nombre',
    last_name: 'Apellidos',
    email: 'Correo electrónico',
    phone: 'Teléfono',
    billing_address: 'Dirección de envío',
    address: 'Dirección',
    postal_code: 'Código postal',
    city: 'Ciudad',
    subtotal: 'Subtotal',
    shipping: 'Envío',
    total: 'Total',
    free: 'Gratis',
    complete_order: 'Completar pedido',
    processing: 'Procesando...',
    checking: 'Verificando pago...',
    locale: 'es_ES',
    currency: 'EUR',
    symbol: '€'
  },
  fr: {
    title: 'Finaliser la Commande',
    customer_info: 'Informations Client',
    first_name: 'Prénom',
    last_name: 'Nom',
    email: 'Adresse e-mail',
    phone: 'Numéro de téléphone',
    billing_address: 'Adresse de livraison',
    address: 'Adresse',
    postal_code: 'Code postal',
    city: 'Ville',
    subtotal: 'Sous-total',
    shipping: 'Livraison',
    total: 'Total',
    free: 'Gratuit',
    complete_order: 'Finaliser la commande',
    processing: 'Traitement...',
    checking: 'Vérification du paiement...',
    locale: 'fr_FR',
    currency: 'EUR',
    symbol: '€'
  },
  'en-gb': {
    title: 'Checkout',
    customer_info: 'Customer Information',
    first_name: 'First name',
    last_name: 'Last name',
    email: 'Email address',
    phone: 'Phone number',
    billing_address: 'Delivery address',
    address: 'Address',
    postal_code: 'Postcode',
    city: 'City',
    subtotal: 'Subtotal',
    shipping: 'Delivery',
    total: 'Total',
    free: 'Free',
    complete_order: 'Complete order',
    processing: 'Processing...',
    checking: 'Checking payment...',
    locale: 'en_GB',
    currency: 'GBP',
    symbol: '£'
  },
  'en-ie': {
    title: 'Checkout',
    customer_info: 'Customer Information',
    first_name: 'First name',
    last_name: 'Last name',
    email: 'Email address',
    phone: 'Phone number',
    billing_address: 'Delivery address',
    address: 'Address',
    postal_code: 'Eircode',
    city: 'City',
    subtotal: 'Subtotal',
    shipping: 'Delivery',
    total: 'Total',
    free: 'Free',
    complete_order: 'Complete order',
    processing: 'Processing...',
    checking: 'Checking payment...',
    locale: 'en_US',
    currency: 'EUR',
    symbol: '€'
  }
};

async function getLanguageFromIP(ip) {
  try {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    const country = response.data.country_code;
    
    if (country === 'NL' || country === 'BE') return 'nl';
    if (country === 'ES') return 'es';
    if (country === 'FR') return 'fr';
    if (country === 'GB') return 'en-gb';
    if (country === 'IE') return 'en-ie';
    return 'en-gb';
  } catch (error) {
    return 'en-gb';
  }
}

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
    message: 'Mollie Payment Gateway Running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/test', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Mollie Test</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { text-align: center; margin-bottom: 30px; }
          button { width: 100%; padding: 15px; background: #000; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
          button:hover { background: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Mollie Test</h1>
          <form method="POST" action="/checkout">
            <input type="hidden" name="amount" value="10.00">
            <input type="hidden" name="currency" value="GBP">
            <input type="hidden" name="order_id" value="TEST-123">
            <input type="hidden" name="return_url" value="https://google.com">
            <input type="hidden" name="cart_items" value='{"items":[{"title":"Test Product","quantity":1,"price":1000,"line_price":1000}]}'>
            <button type="submit">Start Test Checkout £10.00</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url, cart_items } = req.body;
  
  if (!amount || !currency) {
    return res.status(400).send('Missing required parameters');
  }

  const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
  const lang = await getLanguageFromIP(clientIP);
  const t = translations[lang];

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
        <title>${t.title} - ${t.symbol}${amount}</title>
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
              <div class="summary-row"><span>${t.subtotal}</span><span>${t.symbol}${amount}</span></div>
              <div class="summary-row"><span>${t.shipping}</span><span>${t.free}</span></div>
              <div class="summary-row total"><span>${t.total}</span><span>${t.symbol}${amount}</span></div>
            </div>
          </div>
          <div class="payment-form">
            <div id="error-message" class="error"></div>
            <div id="loading-message" class="loading">${t.processing}</div>
            <div class="section">
              <div class="section-title">${t.customer_info}</div>
              <div class="form-group"><label for="email">${t.email} *</label><input type="email" id="email" required></div>
            </div>
            <div class="section">
              <div class="section-title">${t.billing_address}</div>
              <div class="form-row">
                <div class="form-group"><label for="firstName">${t.first_name} *</label><input type="text" id="firstName" required></div>
                <div class="form-group"><label for="lastName">${t.last_name} *</label><input type="text" id="lastName" required></div>
              </div>
              <div class="form-group"><label for="address">${t.address} *</label><input type="text" id="address" required></div>
              <div class="form-row">
                <div class="form-group"><label for="postalCode">${t.postal_code} *</label><input type="text" id="postalCode" required></div>
                <div class="form-group"><label for="city">${t.city} *</label><input type="text" id="city" required></div>
              </div>
            </div>
            <button class="pay-button" onclick="startPayment()">${t.complete_order}</button>
          </div>
        </div>
        <script>
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};

          function displayCartItems() {
            const container = document.getElementById('cart-items');
            if (!cartData || !cartData.items) {
              container.innerHTML = '<p>No products</p>';
              return;
            }
            container.innerHTML = cartData.items.map(item => \`
              <div class="cart-item">
                <div class="item-image"><div class="item-quantity">\${item.quantity}</div></div>
                <div class="item-details"><div class="item-name">\${item.title || item.product_title}</div></div>
                <div class="item-price">${t.symbol}\${(item.price / 100).toFixed(2)}</div>
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
              document.getElementById('error-message').innerHTML = 'Please fill in all fields';
              return;
            }

            document.getElementById('loading-message').style.display = 'block';
            document.querySelector('.pay-button').disabled = true;

            try {
              const response = await fetch('/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  amount: '${amount}', 
                  currency: '${currency}', 
                  customerData, 
                  cartData, 
                  orderId: '${order_id || ''}', 
                  returnUrl: '${return_url || ''}',
                  locale: '${t.locale}'
                })
              });
              const data = await response.json();
              if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
              } else {
                throw new Error('Could not start payment');
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
    const { amount, currency, customerData, cartData, orderId, returnUrl, locale } = req.body;

    const paymentData = {
      amount: { currency: currency.toUpperCase(), value: parseFloat(amount).toFixed(2) },
      description: `Order ${orderId || Date.now()}`,
      redirectUrl: `${APP_URL}/payment/return?order_id=${orderId || ''}&return_url=${encodeURIComponent(returnUrl)}`,
      webhookUrl: `${APP_URL}/webhook/mollie`,
      locale: locale || 'en_GB',
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
  res.send(`<html><head><title>Payment</title><style>body{font-family:Arial;text-align:center;padding:50px;background:#f5f5f5}.box{background:white;padding:40px;border-radius:10px;max-width:500px;margin:0 auto}.spinner{border:4px solid #f3f3f3;border-top:4px solid #000;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></head><body><div class="box"><div class="spinner"></div><h1>Checking payment...</h1></div><script>setTimeout(()=>{window.location.href='${return_url || '/'}'},3000);</script></body></html>`);
});

app.post('/webhook/mollie', async (req, res) => {
  try {
    const { id } = req.body;
    const response = await axios.get(`${MOLLIE_BASE_URL}/payments/${id}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    const payment = response.data;
    
    if (payment.status === 'paid') {
      const customerName = payment.metadata?.customer_name || 'Unknown';
      const customerEmail = payment.metadata?.customer_email || 'Unknown';
      const amount = payment.amount.value;
      const currency = payment.amount.currency;
      const symbol = currency === 'GBP' ? '£' : '€';
      
      let productsText = '';
      if (payment.metadata?.cart_data) {
        try {
          const cartData = JSON.parse(payment.metadata.cart_data);
          if (cartData && cartData.items && cartData.items.length > 0) {
            productsText = '\n\n<b>🛒 Products:</b>\n';
            cartData.items.forEach(item => {
              const itemPrice = (item.line_price || (item.price * item.quantity)) / 100;
              productsText += `• ${item.quantity}x ${item.title} - ${symbol}${itemPrice.toFixed(2)}\n`;
            });
          }
        } catch (e) {
          console.error('Error parsing cart data:', e);
        }
      }
      
      const message = `
<b>✅ PAYMENT RECEIVED - MOLLIE</b>

<b>💰 Amount:</b> ${symbol}${amount} ${currency}
<b>👤 Customer:</b> ${customerName}
<b>📧 Email:</b> ${customerEmail}
<b>🆔 Payment ID:</b> ${id}${productsText}

<b>✓ Status:</b> Paid
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
