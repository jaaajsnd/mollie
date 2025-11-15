require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Mollie credentials
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || 'test_G5TA8k2H2vdtPWDRNNkAE9uJbtyVJD';
const MOLLIE_BASE_URL = 'https://api.mollie.com/v2';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Shopify credentials
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'gdicex-x1.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2024-10';

// In-memory storage voor orders
const pendingOrders = new Map();

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'Shopify-Mollie Payment Gateway is running',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Test Mollie connection
app.get('/test-mollie', async (req, res) => {
  try {
    console.log('Testing Mollie with API Key:', MOLLIE_API_KEY ? 'Present' : 'Missing');
    
    const response = await axios.get(`${MOLLIE_BASE_URL}/methods`, {
      headers: {
        'Authorization': `Bearer ${MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      status: 'success',
      message: 'Mollie connection successful',
      methods: response.data
    });
  } catch (error) {
    console.error('Mollie API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      statusCode: error.response?.status,
      details: error.response?.data
    });
  }
});

// Check payment status endpoint
app.get('/api/check-payment/:paymentId', async (req, res) => {
  const { paymentId } = req.params;
  
  try {
    const response = await axios.get(`${MOLLIE_BASE_URL}/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const payment = response.data;
    console.log('Payment status:', payment.status);
    
    res.json({
      status: payment.status,
      payment: payment
    });
  } catch (error) {
    console.error('Error checking payment:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Checkout pagina
app.get('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url, cart_items } = req.query;
  
  if (!amount || !currency) {
    return res.status(400).send('Verplichte parameters ontbreken: bedrag en valuta');
  }

  // Parse cart items if provided
  let cartData = null;
  if (cart_items) {
    try {
      cartData = JSON.parse(decodeURIComponent(cart_items));
      console.log('Cart data ontvangen:', cartData);
    } catch (e) {
      console.error('Error parsing cart_items:', e);
    }
  }

  // Show payment selection page
  res.send(`
    <html>
      <head>
        <title>Betalen - €${amount}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            margin: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
          }
          .amount {
            text-align: center;
            font-size: 48px;
            font-weight: bold;
            color: #000;
            margin: 20px 0;
          }
          .description {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
          }
          .section {
            margin: 30px 0;
            padding: 20px 0;
            border-top: 1px solid #e0e0e0;
          }
          .section:first-child {
            border-top: none;
            padding-top: 0;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
          }
          .form-group {
            margin-bottom: 15px;
          }
          label {
            display: block;
            font-size: 14px;
            color: #555;
            margin-bottom: 5px;
            font-weight: 500;
          }
          input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
            font-family: inherit;
          }
          input:focus {
            outline: none;
            border-color: #000;
          }
          .form-row {
            display: flex;
            gap: 15px;
          }
          .form-row .form-group {
            flex: 1;
          }
          .payment-methods {
            margin: 20px 0;
          }
          .payment-method {
            display: flex;
            align-items: center;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: all 0.3s;
          }
          .payment-method:hover {
            border-color: #000;
            background: #f9f9f9;
          }
          .payment-method.selected {
            border-color: #000;
            background: #f0f0f0;
          }
          .payment-method input[type="radio"] {
            width: auto;
            margin-right: 15px;
          }
          .payment-method-logo {
            font-size: 24px;
            margin-right: 15px;
          }
          .payment-method-name {
            font-weight: 500;
            font-size: 16px;
          }
          .pay-button {
            width: 100%;
            padding: 15px;
            background: #000;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 20px;
          }
          .pay-button:hover {
            background: #333;
          }
          .pay-button:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .secure {
            text-align: center;
            color: #999;
            font-size: 12px;
            margin-top: 20px;
          }
          .error {
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            display: none;
          }
          .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>💳 Veilig Betalen</h1>
          <div class="amount">€${amount}</div>
          <div class="description">Bestelling ${order_id || ''}</div>
          
          <div id="error-message" class="error"></div>
          <div id="loading-message" class="loading">Betaling verwerken...</div>
          
          <div class="section">
            <div class="section-title">Klantgegevens</div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="firstName">Voornaam *</label>
                <input type="text" id="firstName" placeholder="Jan" required>
              </div>
              <div class="form-group">
                <label for="lastName">Achternaam *</label>
                <input type="text" id="lastName" placeholder="Jansen" required>
              </div>
            </div>
            
            <div class="form-group">
              <label for="email">E-mailadres *</label>
              <input type="email" id="email" placeholder="jan@voorbeeld.nl" required>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Kies betaalmethode</div>
            
            <div class="payment-methods">
              <label class="payment-method" onclick="selectMethod('ideal')">
                <input type="radio" name="payment-method" value="ideal" checked>
                <span class="payment-method-logo">🏦</span>
                <span class="payment-method-name">iDEAL</span>
              </label>
              
              <label class="payment-method" onclick="selectMethod('creditcard')">
                <input type="radio" name="payment-method" value="creditcard">
                <span class="payment-method-logo">💳</span>
                <span class="payment-method-name">Credit Card</span>
              </label>
              
              <label class="payment-method" onclick="selectMethod('bancontact')">
                <input type="radio" name="payment-method" value="bancontact">
                <span class="payment-method-logo">🇧🇪</span>
                <span class="payment-method-name">Bancontact</span>
              </label>
            </div>
          </div>

          <button class="pay-button" onclick="startPayment()">
            Betaal €${amount}
          </button>
          
          <div class="secure">
            🔒 Veilig betalen met Mollie
          </div>
        </div>

        <script>
          let selectedMethod = 'ideal';
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};

          function selectMethod(method) {
            selectedMethod = method;
            document.querySelectorAll('.payment-method').forEach(el => {
              el.classList.remove('selected');
            });
            event.currentTarget.classList.add('selected');
          }

          function validateCustomerInfo() {
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const email = document.getElementById('email').value.trim();
            
            if (!firstName || !lastName || !email) {
              return false;
            }
            
            return {
              firstName,
              lastName,
              email
            };
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
                body: JSON.stringify({
                  amount: '${amount}',
                  currency: '${currency}',
                  method: selectedMethod,
                  customerData: customerData,
                  cartData: cartData,
                  orderId: '${order_id || ''}',
                  returnUrl: '${return_url || APP_URL}'
                })
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

          // Auto-select payment method on click
          document.querySelectorAll('.payment-method').forEach(el => {
            el.addEventListener('click', function() {
              this.querySelector('input[type="radio"]').checked = true;
            });
          });
        </script>
      </body>
    </html>
  `);
});

// Create Mollie payment
app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, currency, method, customerData, cartData, orderId, returnUrl } = req.body;
    
    console.log('Creating Mollie payment:', { amount, currency, method });

    const paymentData = {
      amount: {
        currency: currency.toUpperCase(),
        value: parseFloat(amount).toFixed(2)
      },
      description: `Bestelling ${orderId || Date.now()}`,
      redirectUrl: `${APP_URL}/payment/return?order_id=${orderId || ''}&return_url=${encodeURIComponent(returnUrl)}`,
      webhookUrl: `${APP_URL}/webhook/mollie`,
      metadata: {
        order_id: orderId || '',
        customer_email: customerData.email,
        customer_name: `${customerData.firstName} ${customerData.lastName}`
      }
    };

    // Add method if specified
    if (method && method !== 'creditcard') {
      paymentData.method = method;
    }

    console.log('Payment data:', paymentData);

    const response = await axios.post(
      `${MOLLIE_BASE_URL}/payments`,
      paymentData,
      {
        headers: {
          'Authorization': `Bearer ${MOLLIE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const payment = response.data;
    console.log('Mollie payment created:', payment.id);

    // Store payment info
    pendingOrders.set(payment.id, {
      orderId,
      customerData,
      cartData,
      returnUrl,
      created_at: new Date()
    });

    res.json({
      status: 'success',
      paymentId: payment.id,
      checkoutUrl: payment._links.checkout.href
    });

  } catch (error) {
    console.error('Error creating payment:', error.message);
    console.error('Error details:', error.response?.data);
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      details: error.response?.data
    });
  }
});

// Payment return page
app.get('/payment/return', async (req, res) => {
  const { order_id, return_url } = req.query;
  
  res.send(`
    <html>
      <head>
        <title>Betaling Verwerken</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #000;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h1 { color: #333; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="spinner"></div>
          <h1>Betaling controleren...</h1>
          <p>Een moment geduld, we controleren de status van je betaling.</p>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = '${return_url || '/'}';
          }, 3000);
        </script>
      </body>
    </html>
  `);
});

// Webhook endpoint for Mollie
app.post('/webhook/mollie', async (req, res) => {
  try {
    const { id } = req.body;
    console.log('Mollie webhook received for payment:', id);
    
    // Get payment status
    const response = await axios.get(`${MOLLIE_BASE_URL}/payments/${id}`, {
      headers: {
        'Authorization': `Bearer ${MOLLIE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const payment = response.data;
    console.log('Payment status:', payment.status);
    
    if (payment.status === 'paid') {
      console.log('✅ Payment successful:', id);
      // Hier kun je een Shopify order aanmaken als je wilt
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 App URL: ${APP_URL}`);
  console.log(`✅ Mollie API configured: ${MOLLIE_API_KEY ? 'Yes' : 'No'}`);
  console.log(`🔗 Checkout URL: ${APP_URL}/checkout`);
});
