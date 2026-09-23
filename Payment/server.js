  require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Хранилище пользователей (в памяти, для продакшена используйте базу данных)
const users = new Map();

// Данные владельца
const ownerData = {
  username: 'ключи',
  password: '66666'
};

const ownerData2 = {
  username: 'владелец',
  password: '6767676767'
};

// Добавляем владельцев в хранилище
users.set(ownerData.username, {
  username: ownerData.username,
  password: hashPassword(ownerData.password),
  isOwner: true
});

users.set(ownerData2.username, {
  username: ownerData2.username,
  password: hashPassword(ownerData2.password),
  isOwner: true
});

// Функция хеширования пароля
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Middleware для проверки сессии
function checkAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  
  if (sessionId && users.has(sessionId)) {
    req.user = users.get(sessionId);
    req.user.username = sessionId;
  }
  
  next();
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(checkAuth);

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница входа
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Страница регистрации
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// API: Регистрация
app.post('/api/register', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите имя и пароль' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Имя должно быть не менее 3 символов' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    
    if (users.has(username)) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    // Создаём пользователя
    users.set(username, {
      username,
      password: hashPassword(password),
      isOwner: false
    });
    
    res.json({ success: true, message: 'Регистрация успешна' });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Вход
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите имя и пароль' });
    }
    
    const user = users.get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Неверное имя или пароль' });
    }
    
    const hashedPassword = hashPassword(password);
    
    if (user.password !== hashedPassword) {
      return res.status(401).json({ error: 'Неверное имя или пароль' });
    }
    
    res.json({ 
      success: true, 
      username: user.username,
      isOwner: user.isOwner
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Выход
app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

// API: Проверка статуса авторизации
app.get('/api/auth-status', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  
  if (sessionId && users.has(sessionId)) {
    const user = users.get(sessionId);
    res.json({ 
      loggedIn: true, 
      username: user.username,
      isOwner: user.isOwner
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Создание сессии оплаты
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { hours } = req.body;
    
    if (!hours || hours <= 0) {
      return res.status(400).json({ error: 'Некорректное количество часов' });
    }

    const amountInCents = Math.round(hours * 0.21 * 100);

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

    res.json({ sessionId: session.id,
