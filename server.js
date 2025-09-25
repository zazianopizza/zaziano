// backend/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import multer from 'multer'; // ← أضف هذه المكتبة
import bcrypt from 'bcrypt'; // ← نستخدمه لتشفير كلمة المرور

import dotenv from 'dotenv';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { dirname, resolve } from 'path';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3001;



// تفعيل CORS
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 🔹 أولًا: خدمة الملفات الثابتة (CSS, JS, صور)
app.use(express.static(path.join(__dirname, 'public')));


// --- تخزين كلمات المرور للمشرفين (في ملف أو قاعدة بيانات لاحقًا) ---
const SALT_ROUNDS = 10;

// تحميل بيانات المشرف من البيئة
const loadAdmins = () => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('❌ يجب تحديد ADMIN_USERNAME و ADMIN_PASSWORD في ملف .env');
    process.exit(1);
  }

  // تشفير كلمة المرور عند التشغيل
  const hashedPassword = bcrypt.hashSync(password, SALT_ROUNDS);

  // إرجاع مصفوفة تحتوي على المشرف (في الذاكرة فقط)
  return [
    {
      id: 1,
      username,
      password: hashedPassword
    }
  ];
};

// تحميل المشرفين إلى الذاكرة
let admins = loadAdmins();

// --- نقطة نهاية تسجيل الدخول ---
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  const admin = admins.find(a => a.username === username);
  if (!admin) {
    return res.status(401).json({ error: 'Falscher Benutzername oder falsches Passwort' });
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Falscher Benutzername oder falsches Passwort' });
  }

  // نعود برمز مصادقة بسيط (يمكنك استخدام JWT لاحقًا)
  res.json({ success: true, token: 'admin-auth-token-2025' });
});

// خدمة الملفات الثابتة (صور المنتجات)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// إعداد multer لرفع الصور
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const productId = req.body.id || Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `product-${productId}${ext}`);
  }
});

const upload = multer({ storage });

// --- رفع الصورة ---
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Bild nicht hochgeladen' });
  }
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ filePath });
});

// --- حفظ بيانات المنتجات ---
app.post('/api/products', (req, res) => {
  const newData = req.body;
  const filePath = path.join(__dirname, 'data', 'products.json');
  fs.writeFile(filePath, JSON.stringify(newData, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('Das Schreiben der Datei ist fehlgeschlagen:', err);
      return res.status(500).json({ error: 'Daten konnten nicht gespeichert werden' });
    }
    res.json({ message: 'Erfolgreich gespeichert' });
  });
});

// --- تحميل البيانات ---
app.get('/api/products', (req, res) => {
  const filePath = path.join(__dirname, 'data', 'products.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Lesen der Datei fehlgeschlagen:', err);
      return res.status(500).json({ error: 'Das Laden der Daten ist fehlgeschlagen' });
    }
    res.json(JSON.parse(data));
  });
});


// server.js (Node.js + Express)
app.post('/api/forward-to-liefersoft', async (req, res) => {
  try {
    const orderPayload = req.body;

    // 1. إرسال طلب تسجيل الدخول للحصول على accessToken
    const loginResponse = await fetch('https://api.liefersoft.de/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8'
      },
      body: JSON.stringify({
        login: process.env.LIEFERSOFT_LOGIN,
        password: process.env.LIEFERSOFT_PASSWORD,
        companyId: process.env.LIEFERSOFT_COMPANY_ID
      })
    });

    if (!loginResponse.ok) {
      const loginError = await loginResponse.text();
      console.error('Login failed:', loginResponse.status, loginError);
      return res.status(500).json({ error: 'Liefersoft login failed', details: loginError });
    }

    const loginData = await loginResponse.json();
    const accessToken = loginData.accessToken;

    if (!accessToken) {
      console.error('AccessToken not received from Liefersoft');
      return res.status(500).json({ error: 'Token not received from Liefersoft' });
    }

    // 2. إرسال الطلب إلى Liefersoft باستخدام التوكن
    const ordersResponse = await fetch('https://api.liefersoft.de/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(orderPayload)
    });

    const responseData = await ordersResponse.text(); // استخدم نص أولًا

    if (!ordersResponse.ok) {
      console.error('Liefersoft API Error:', ordersResponse.status, responseData);
      return res.status(ordersResponse.status).json({
        error: 'Failed to send request to Liefersoft',
        details: responseData
      });
    }

    // تحويل الاستجابة إلى JSON
    let result;
    try {
      result = JSON.parse(responseData);
    } catch (parseError) {
      // إذا لم يكن JSON، أعد كنص
      result = { message: 'Request successful, but response is not JSON', raw: responseData };
    }

    // 3. أعد النجاح إلى العميل
    return res.status(200).json({
      success: true,
      message: 'Request sent successfully',
      data: result
    });

  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    });
  }
});

// --- حفظ طلب جديد (من واجهة المستخدم) ---
app.post('/api/orders', (req, res) => {
  const newOrder = { ...req.body, id: Date.now(), createdAt: new Date().toISOString(), status: 'pending' };
  const filePath = path.join(__dirname, 'data', 'orders.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Anfragen konnten nicht gelesen werden' });
    const orders = JSON.parse(data);
    orders.push(newOrder);
    fs.writeFile(filePath, JSON.stringify(orders, null, 2), 'utf8', (err) => {
      if (err) return res.status(500).json({ error: 'Anfrage konnte nicht gespeichert werden' });
      res.json({ message: 'Anfrage gespeichert', order: newOrder });
    });
  });
});

// --- تحميل جميع الطلبات ---
app.get('/api/orders', (req, res) => {
  const filePath = path.join(__dirname, 'data', 'orders.json');

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err || !data || data.trim() === '') {
      console.warn('Anwendungsdatei ist nicht verfügbar oder leer');
      return res.json([]);
    }

    try {
      res.json(JSON.parse(data));
    } catch (err) {
      console.error('Die Datei orders.json ist beschädigt:', err);
      res.json([]);
    }
  });
});

// --- تحديث حالة الطلب ---
app.put('/api/orders/:id', (req, res) => {
  const orderId = parseInt(req.params.id);
  const { status } = req.body;
  const filePath = path.join(__dirname, 'data', 'orders.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Anfragen konnten nicht gelesen werden' });
    const orders = JSON.parse(data);
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
    order.status = status;
    fs.writeFile(filePath, JSON.stringify(orders, null, 2), 'utf8', (err) => {
      if (err) return res.status(500).json({ error: 'Statusaktualisierung fehlgeschlagen' });
      res.json({ message: 'Aktualisiert', order });
    });
  });
});
// --- حذف طلب ---
app.delete('/api/orders/:id', (req, res) => {
  const orderId = parseInt(req.params.id);
  const filePath = path.join(__dirname, 'data', 'orders.json');

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Fehler beim Lesen der Anforderungsdatei:', err);
      return res.status(500).json({ error: 'Anfragen konnten nicht gelesen werden' });
    }

    let orders = JSON.parse(data);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Anfrage nicht gefunden' });
    }

    // حذف الطلب
    orders.splice(orderIndex, 1);

    // حفظه في الملف
    fs.writeFile(filePath, JSON.stringify(orders, null, 2), 'utf8', (err) => {
      if (err) {
        console.error('Datei konnte nach dem Löschen nicht gespeichert werden:', err);
        return res.status(500).json({ error: 'Änderungen konnten nicht gespeichert werden' });
      }
      res.json({ message: 'Die Anfrage wurde erfolgreich gelöscht' });
    });
  });
});

// --- 2. مسار جديد: إرسال بريد التأكيد (send-order-email) ---


app.post('/api/send-order-email', async (req, res) => {
  const { orderData, orderId } = req.body;

  if (!orderData || !orderData.customer?.email) {
    return res.status(400).json({ error: 'Ungültige Bestelldaten oder E-Mail' });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Zaziano Restaurant <info@zaziano.de>', // ← يمكنك تغييره لاحقًا
      to: [orderData.customer.email],
      subject: `Bestellbestätigung #${orderId} - Zaziano Restaurant`,
      html: `
        <div style="direction: ltr; text-align: left; padding: 20px; background: #f9f9f9;">
          <h2 style="color: #096332;">Vielen Dank für Ihre Bestellung!</h2>
          <p>Lieber ${orderData.customer.firstName} ${orderData.customer.lastName || ''},</p>
          <p>vielen Dank für Ihre Bestellung bei uns. Hier sind die Details:</p>

          <div style="margin: 20px 0; padding: 15px; background: #ffffff; border: 1px solid #ddd; border-radius: 8px;">
            <h3>📦 Bestellinformationen</h3>
            <p><strong>Bestellnummer:</strong> ${orderId}</p>
            <p><strong>Datum:</strong> ${new Date().toLocaleDateString('de-DE')}</p>
            <p><strong>Lieferart:</strong> ${orderData.delivery.type === 'delivery' ? 'Lieferung' : 'Abholung'}</p>
            ${orderData.delivery.preorderTime ? `<p><strong>Bestellzeit:</strong> ${orderData.delivery.preorderTime}</p>` : ''}
            <p><strong>Zahlungsart:</strong> ${orderData.payment.method === 'cash' ? 'Bar bei Lieferung' : 'Karte'}</p>
          </div>

          <h3>📋 Bestellte Artikel</h3>
          <ul style="list-style: none; padding: 0;">
            ${orderData.items.map(item => `
              <li style="margin-bottom: 10px;">
                <strong>${item.quantity} × ${item.name}</strong>
                ${item.sizeLabel ? `(${item.sizeLabel})` : ''}
                <br/>
                Preis: ${item.totalPrice.toFixed(2)} €
                ${item.extras.length > 0 ? `
                  <div style="margin-top: 5px; font-size: 0.9em; color: #555;">
                    <strong>Zusatz:</strong>
                    ${item.extras.map(ex => `${ex.quantity} × ${ex.name} (${(ex.price * ex.quantity).toFixed(2)} €)`).join(', ')}
                  </div>
                ` : ''}
              </li>
            `).join('')}
          </ul>

          <div style="margin-top: 20px; font-size: 1.1em;">
            <p><strong>Zwischensumme:</strong> ${orderData.subtotal.toFixed(2)} €</p>
            <p><strong>Lieferkosten:</strong> ${orderData.deliveryFee.toFixed(2)} €</p>
            <p><strong>Gesamtsumme:</strong> ${orderData.totalPrice.toFixed(2)} €</p>
          </div>

          <hr style="margin: 20px 0; border: 1px solid #eee;" />
          <p style="color: #777;">Wir freuen uns auf Ihre Bestellung. Bei Fragen erreichen Sie uns jederzeit.</p>
          <p><strong>Zaziano Restaurant</strong><br/><strong>Telefon:</strong><a href="tel:+4917660366606">+4917660366606</a><strong>Mail:</strong> <a href="mailto:info@zaziano.de">info@zaziano.de</a></p>
        </div>
      `
    });

    if (error) {
      console.error('Resend Fehler:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'E-Mail erfolgreich gesendet', data });
  } catch (err) {
    console.error('Serverfehler:', err);
    return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden.' });
  }
});

// --- تحميل أوقات العمل ---
const HOURS_FILE = path.join(__dirname, 'data','openingHours.json');

// GET: جلب أوقات العمل
app.get('/api/opening-hours', (req, res) => {
  try {
    const data = fs.readFileSync(HOURS_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read opening hours' });
  }
});

// PUT: حفظ أوقات العمل
app.put('/api/opening-hours', (req, res) => {
  try {
    const newSchedule = req.body;

    // التحقق من الأيام
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (let day of days) {
      if (!newSchedule[day]) {
        return res.status(400).json({ error: `Missing data for ${day}` });
      }
    }

    fs.writeFileSync(HOURS_FILE, JSON.stringify(newSchedule, null, 2), 'utf8');
    res.json({ message: 'Updated successfully', schedule: newSchedule });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file' });
  }
});



// --- إنشاء جلسة دفع ---
app.post('/api/create-checkout-session', async (req, res) => {
  const { items, customerEmail, orderId, deliveryType } = req.body;

  try {
    let lineItems = items.flatMap(item => {
      const productItems = [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.name,
              description: item.sizeLabel
            },
            unit_amount: Math.round(item.basePrice * 100)
          },
          quantity: item.quantity
        }
      ];

      // أضف الملحقات
      if (item.extras && item.extras.length > 0) {
        const addonItems = item.extras
          .filter(ex => ex.quantity > 0)
          .map(ex => ({
            price_data: {
              currency: 'eur',
              product_data: {
                name: `${ex.name}`,
                description: `${item.name} (${item.sizeLabel})`
              },
              unit_amount: Math.round(ex.price * 100)
            },
            quantity: ex.quantity
          }));
        return [...productItems, ...addonItems];
      }

      return productItems;
    });

    // ✅ أضف رسوم التوصيل كعنصر منفصل إذا كان التوصيل مطلوبًا
    if (deliveryType === 'delivery') {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Lieferung',
            description: 'für die Lieferung'
          },
          unit_amount: 500 // 5.00 € بالسنتات
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'card',
        'paypal',
        'sepa_debit',
        'klarna',
        'giropay',
        'eps',
        'p24',           // ❌ ليس 'przelewy24'
        'ideal',
        'alipay',
        'link'// للولايات المتحدة'affirm', 
        //'afterpay_clearpay'
      ],
      line_items: lineItems,
      mode: 'payment',
      success_url: 'https://www.zaziano.de/payment-success?order_id=' + orderId,
      cancel_url: 'https://www.zaziano.de/payment-failed',
      customer_email: customerEmail,
      metadata: { order_id: orderId }
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('Zahlungssitzung konnte nicht erstellt werden:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- التحقق من الدفع ---
app.get('/api/checkout-session', async (req, res) => {
  const { session_id } = req.query;
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({
      payment_status: session.payment_status,
      customer_email: session.customer_details.email,
      metadata: session.metadata
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/google-maps-key', (req, res) => {
  // المفتاح مخفي في ملف .env
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  res.json({ key: apiKey });
});

// مسار ملف الإعدادات
const SETTINGS_FILE = path.join(import.meta.dirname, 'data','settings.json');

// 📁 تحقق من وجود ملف الإعدادات — باستخدام fs.stat
async function ensureSettingsFile() {
  try {
    await fs.promises.stat(SETTINGS_FILE); // ✅ نستخدم fs.promises.stat
  } catch {
    const defaultSettings = { deliveryFee: 5.00 };
    await fs.promises.writeFile(
      SETTINGS_FILE,
      JSON.stringify(defaultSettings, null, 2),
      { encoding: 'utf8' }
    );
  }
}

// 🔍 جلب الإعدادات من الملف
app.get('/api/settings', async (req, res) => {
  try {
    const data = await fs.promises.readFile(SETTINGS_FILE, { encoding: 'utf8' });
    const settings = JSON.parse(data);
    res.json(settings);
  } catch (err) {
    console.error('❌ Fehler beim Lesen der Einstellungsdatei:', err);
    res.status(500).json({ error: 'Einstellungen konnten nicht abgerufen werden' });
  }
});

// 💾 حفظ الإعدادات في الملف
app.post('/api/settings', async (req, res) => {
  const { deliveryFee } = req.body;

  if (typeof deliveryFee !== 'number' || isNaN(deliveryFee)) {
    return res.status(400).json({ error: 'Bitte geben Sie einen gültigen Preis ein' });
  }

  try {
    const data = await fs.promises.readFile(SETTINGS_FILE, { encoding: 'utf8' });
    const settings = JSON.parse(data);
    settings.deliveryFee = parseFloat(deliveryFee.toFixed(2));

    await fs.promises.writeFile(
      SETTINGS_FILE,
      JSON.stringify(settings, null, 2),
      { encoding: 'utf8' }
    );

    res.json({
      success: true,
      settings,
      message: 'Einstellungen erfolgreich gespeichert'
    });
  } catch (err) {
    console.error('❌ Fehler beim Speichern der Einstellungen:', err);
    res.status(500).json({ error: 'Einstellungen konnten nicht gespeichert werden' });
  }
});
ensureSettingsFile()

// 🔹 أخيرًا: أي مسار غير معالج (وليس API أو data) يُوجَّه إلى index.html
app.get('*', (req, res) => {
  // منع الوصول إلى /data/*
  if (req.path.startsWith('/data')) {
    return res.status(403).send('الوصول ممنوع');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Der Server arbeitet an http://localhost:${PORT}`);
});
