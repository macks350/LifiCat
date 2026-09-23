require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Создание сессии оплаты
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { hours } = req.body;
    
    if (!hours || hours <= 0) {
      return res.status(400).json({ error: 'Некорректное количество часов' });
    }

    const amountInCents = Math.round(hours * 0.21 * 100); // 0.21$ в час

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Обучение: Как получить больше подписчиков',
              description: `Оплата за ${hours} час(ов) обучения`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.CANCEL_URL,
      metadata: {
        hours: hours.toString(),
        rate: '0.21',
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Ошибка создания сессии:', error);
    res.status(500).json({ error: 'Ошибка сервера при создании оплаты' });
  }
});

// Вебхук для подтверждения оплаты (обязательно для продакшена)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Ошибка вебхука:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Обработка успешной оплаты
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Оплата успешна!', {
      sessionId: session.id,
      amount: session.amount_total,
      hours: session.metadata.hours,
    });
    
    // Здесь можно сохранить в базу данных, отправить письмо и т.д.
  }

  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
