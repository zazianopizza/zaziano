// backend/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import multer from 'multer'; // ← أضف هذه المكتبة
import bcrypt from 'bcrypt'; // ← نستخدمه لتشفير كلمة المرور
import mongoose from 'mongoose';

import dotenv from 'dotenv';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { dirname, resolve } from 'path';
import Product from './models/Product.js';
import OpeningHours from './models/OpeningHours.js';
import Settings from './models/Settings.js';
import Order from './models/Order.js';
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

// --- جلب جميع المنتجات ---
// --- جلب البيانات ---
app.get('/api/products', async (req, res) => {
  try {
    // ✅ جلب المنتجات مرتبة حسب sectionOrder → order → id
    const products = await Product.find().sort({ sectionOrder: 1, order: 1, id: 1 });

    const result = {};

    for (const doc of products) {
      if (!doc.data || typeof doc.data !== 'string') {
        console.warn(`⚠️ وثيقة بدون بيانات صالحة: ${doc._id} | section: ${doc.section}`);
        continue;
      }

      let data;
      try {
        data = JSON.parse(doc.data);
      } catch (parseErr) {
        console.error(`❌ فشل في تحليل JSON للوثيقة ${doc._id}:`, parseErr);
        continue;
      }

      const section = doc.section;

      if (!result[section]) {
        result[section] = [];
      }

      result[section].push(data);
    }

    // ✅ إعادة ترتيب الأقسام حسب sectionOrder (المخزن في قاعدة البيانات)
    // نستخرج الأقسام الفريدة مع ترتيبها
    const uniqueSections = [...new Set(products.map(p => p.section))];
    const orderedSections = uniqueSections.sort((a, b) => {
      const aDoc = products.find(p => p.section === a);
      const bDoc = products.find(p => p.section === b);
      return (aDoc?.sectionOrder || 99) - (bDoc?.sectionOrder || 99);
    });

    // ✅ بناء النتيجة النهائية بترتيب الأقسام
    const orderedResult = {};
    orderedSections.forEach(section => {
      if (result[section]) {
        orderedResult[section] = result[section];
      }
    });

    console.log('✅ تم جلب المنتجات بنجاح');
    res.json(orderedResult);

  } catch (err) {
    console.error('❌ خطأ في جلب المنتجات:', err);
    res.status(500).json({ error: 'فشل في جلب المنتجات', details: err.message });
  }
});
// --- حفظ المنتج الجديد ---
// --- حفظ المنتج الجديد ---
app.post('/api/products', async (req, res) => {
  try {
    const newData = req.body;

    if (!newData || typeof newData !== 'object') {
      return res.status(400).json({ error: 'بيانات غير صالحة — يجب أن يكون كائنًا' });
    }

    // ✅ التحقق من أن كل قسم يحتوي على مصفوفة
    for (const section of Object.keys(newData)) {
      if (!Array.isArray(newData[section])) {
        return res.status(400).json({
          error: `القسم "${section}" يجب أن يكون مصفوفة`
        });
      }
    }

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    // ✅ تحديد ترتيب الأقسام ديناميكيًا بناءً على ترتيبها في newData
    const sections = Object.keys(newData);
    const sectionOrderMap = {};
    sections.forEach((section, index) => {
      sectionOrderMap[section] = index; // ← أول قسم = 0، ثاني قسم = 1، وهكذا
    });

    for (const section of sections) {
      const sectionOrder = sectionOrderMap[section];

      for (const product of newData[section]) {
        if (!product.id || typeof product.id !== 'number') {
          results.errors.push(`منتج في القسم "${section}" بدون id رقمي`);
          continue;
        }

        let dataString;
        try {
          dataString = JSON.stringify(product);
        } catch (err) {
          results.errors.push(`فشل في تحويل المنتج ${product.id} في القسم ${section} إلى JSON`);
          continue;
        }

        const filter = { section, id: product.id };
        const updateData = {
          $set: {
            data: dataString,
            order: product.order || 0,
            sectionOrder: sectionOrder, // ← ترتيب القسم ديناميكيًا!
            updatedAt: new Date()
          }
        };

        const options = { upsert: true, new: true };

        try {
          const dbProduct = await Product.findOneAndUpdate(filter, updateData, options);

          if (dbProduct.isNew) {
            results.created++;
          } else {
            results.updated++;
          }

        } catch (err) {
          results.errors.push(`فشل في حفظ المنتج ${product.id} في القسم ${section}: ${err.message}`);
        }
      }
    }

    console.log(`✅ تم الحفظ: ${results.created} جديد، ${results.updated} محدث، ${results.errors.length} خطأ`);

    res.json({
      message: 'تم حفظ المنتجات بنجاح',
      stats: results
    });

  } catch (err) {
    console.error('❌ خطأ في حفظ المنتجات:', err);
    res.status(500).json({
      error: 'فشل في حفظ المنتجات',
      details: err.message
    });
  }
});

// --- حذف منتج ---
app.delete('/api/products/:section/:id', async (req, res) => {
  try {
    const { section, id } = req.params;

    // ✅ التحقق من المدخلات
    if (!section || typeof section !== 'string') {
      return res.status(400).json({ error: 'حقل "section" مطلوب وينبغي أن يكون نصًا' });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'حقل "id" مطلوب وينبغي أن يكون رقمًا' });
    }

    const productId = parseInt(id);

    // ✅ البحث عن المنتج وحذفه
    const result = await Product.deleteOne({ section, id: productId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: `لم يتم العثور على منتج بالقسم "${section}" والرقم "${productId}"`
      });
    }

    console.log(`✅ تم حذف المنتج: ID=${productId} | Section=${section}`);

    res.json({
      message: 'تم حذف المنتج بنجاح',
      deletedCount: result.deletedCount
    });

  } catch (err) {
    console.error('❌ خطأ في حذف المنتج:', err);
    res.status(500).json({
      error: 'فشل في حذف المنتج',
      details: err.message
    });
  }
});


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


// POST: إنشاء طلب جديد
app.post('/api/orders', async (req, res) => {
  try {
    const newOrderData = req.body;

    // ✅ التحقق من أن البيانات موجودة
    if (!newOrderData.customer || !newOrderData.items || !newOrderData.totalPrice) {
      return res.status(400).json({ error: 'بيانات الطلب غير كاملة' });
    }

    // ✅ إنشاء ID جديد
    const orderId = Date.now();

    // ✅ إنشاء الطلب
    const newOrder = new Order({
      ...newOrderData,
      id: orderId,
      createdAt: new Date(),
      status: 'pending'
    });

    // ✅ حفظ الطلب
    await newOrder.save();

    console.log(`✅ تم إنشاء الطلب: ID=${orderId}`);
    res.json({ message: 'Anfrage gespeichert', order: newOrder });

  } catch (err) {
    console.error('❌ خطأ في إنشاء الطلب:', err);
    res.status(500).json({ error: 'Anfrage konnte nicht gespeichert werden' });
  }
});

// GET: جلب جميع الطلبات
app.get('/api/orders', async (req, res) => {
  try {
    // ✅ جلب جميع الطلبات مرتبة حسب التاريخ (الأحدث أولًا)
    const orders = await Order.find().sort({ createdAt: -1 });

    res.json(orders);

  } catch (err) {
    console.error('❌ خطأ في جلب الطلبات:', err);
    res.status(500).json({ error: 'Anfragen konnten nicht gelesen werden' });
  }
});

// PUT: تحديث حالة الطلب
app.put('/api/orders/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { status } = req.body;

  // ✅ التحقق من أن الحالة صالحة
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'حالة غير صالحة' });
  }

  try {
    // ✅ البحث عن الطلب وتحديثه
    const order = await Order.findOneAndUpdate(
      { id: orderId },
      { $set: { status } },
      { new: true } // ← لإعادة الطلب بعد التحديث
    );

    if (!order) {
      return res.status(404).json({ error: 'Anfrage nicht gefunden' });
    }

    console.log(`✅ تم تحديث حالة الطلب: ID=${orderId} → ${status}`);
    res.json({ message: 'Aktualisiert', order });

  } catch (err) {
    console.error('❌ خطأ في تحديث حالة الطلب:', err);
    res.status(500).json({ error: 'Statusaktualisierung fehlgeschlagen' });
  }
});
// DELETE: حذف طلب
app.delete('/api/orders/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);

  try {
    // ✅ البحث عن الطلب وحذفه
    const result = await Order.deleteOne({ id: orderId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Anfrage nicht gefunden' });
    }

    console.log(`✅ تم حذف الطلب: ID=${orderId}`);
    res.json({ message: 'Die Anfrage wurde erfolgreich gelöscht' });

  } catch (err) {
    console.error('❌ خطأ في حذف الطلب:', err);
    res.status(500).json({ error: 'Änderungen konnten nicht gespeichert werden' });
  }
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
            ${orderData.delivery.preorderTime ? `<p><strong>Bestellzeit:</strong> ${orderData.delivery.preorderTime}</p>` : `${orderData.delivery.pickupTime}`}
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
app.get('/api/opening-hours', async (req, res) => {
  try {
    // ✅ البحث عن السجل الوحيد
    let hours = await OpeningHours.findOne();

    // ✅ إذا لم يكن موجودًا، أنشئه بالقيم الافتراضية
    if (!hours) {
      hours = new OpeningHours();
      await hours.save();
    }

    res.json(hours.schedule);

  } catch (err) {
    console.error('❌ خطأ في جلب أوقات العمل:', err);
    res.status(500).json({ error: 'Failed to read opening hours' });
  }
});

// PUT: حفظ أوقات العمل
app.put('/api/opening-hours', async (req, res) => {
  try {
    const newSchedule = req.body;

    // ✅ التحقق من أن newSchedule كائن
    if (!newSchedule || typeof newSchedule !== 'object') {
      return res.status(400).json({ error: 'بيانات غير صالحة — يجب أن يكون كائنًا' });
    }

    // ✅ التحقق من أيام الأسبوع
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (let day of days) {
      if (!newSchedule[day]) {
        return res.status(400).json({ error: `Missing data for ${day}` });
      }

      // ✅ التحقق من أن كل يوم يحتوي على الحقول المطلوبة
      const dayData = newSchedule[day];
      if (
        typeof dayData.open !== 'boolean' ||
        typeof dayData.openingTime !== 'string' ||
        typeof dayData.closingTime !== 'string' ||
        (dayData.breakStart !== null && typeof dayData.breakStart !== 'string') ||
        (dayData.breakEnd !== null && typeof dayData.breakEnd !== 'string')
      ) {
        return res.status(400).json({ error: `Invalid format for ${day}` });
      }
    }

    // ✅ البحث عن السجل أو إنشاؤه
    let hours = await OpeningHours.findOne();
    if (!hours) {
      hours = new OpeningHours();
    }

    // ✅ تحديث الجدول
    hours.schedule = newSchedule;
    await hours.save();

    console.log('✅ تم تحديث أوقات العمل بنجاح');
    res.json({ message: 'Updated successfully', schedule: hours.schedule });

  } catch (err) {
    console.error('❌ خطأ في حفظ أوقات العمل:', err);
    res.status(500).json({ error: 'Failed to write to database' });
  }
});


// --- إنشاء جلسة دفع ---
app.post('/api/create-checkout-session', async (req, res) => {
  const { items, customerEmail, orderId, deliveryType,deliveryFee } = req.body;

  try {
    let lineItems = items.flatMap(item => {
       const description = item.sizeLabel && item.sizeLabel.trim() !== '' 
      ? item.sizeLabel 
      : 'Keine Größe';
      const productItems = [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.name,
              ...(description && { description })
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
          unit_amount: Math.round(deliveryFee * 100) // ⚠️ التحويل إلى سنتات
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
      success_url: `https://www.zaziano.de/payment-success?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
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
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
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

// GET: جلب الإعدادات
app.get('/api/settings', async (req, res) => {
  try {
    // ✅ البحث عن السجل الوحيد
    let settings = await Settings.findOne();

    // ✅ إذا لم يكن موجودًا، أنشئه بالقيمة الافتراضية
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }

    res.json({
      deliveryFee: settings.deliveryFee
    });

  } catch (err) {
    console.error('❌ خطأ في جلب الإعدادات:', err);
    res.status(500).json({ error: 'Einstellungen konnten nicht abgerufen werden' });
  }
});
// POST: حفظ الإعدادات
app.post('/api/settings', async (req, res) => {
  const { deliveryFee } = req.body;

  // ✅ التحقق من أن deliveryFee رقم صالح
  if (typeof deliveryFee !== 'number' || isNaN(deliveryFee)) {
    return res.status(400).json({ error: 'Bitte geben Sie einen gültigen Preis ein' });
  }

  try {
    // ✅ البحث عن السجل أو إنشاؤه
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    // ✅ تحديث السعر
    settings.deliveryFee = parseFloat(deliveryFee.toFixed(2));
    await settings.save();

    console.log('✅ تم تحديث سعر التوصيل بنجاح:', settings.deliveryFee);
    res.json({
      success: true,
      settings: {
        deliveryFee: settings.deliveryFee
      },
      message: 'Einstellungen erfolgreich gespeichert'
    });

  } catch (err) {
    console.error('❌ خطأ في حفظ الإعدادات:', err);
    res.status(500).json({ error: 'Einstellungen konnten nicht gespeichert werden' });
  }
});

// 🔹 أخيرًا: أي مسار غير معالج (وليس API أو data) يُوجَّه إلى index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/data')) {
    return res.status(403).send('الوصول ممنوع');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// اتصال بقاعدة البيانات
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB متصل'))
.catch(err => console.error('❌ خطأ في الاتصال بـ MongoDB:', err));

app.listen(PORT, () => {
  console.log(`✅ Der Server arbeitet an http://localhost:${PORT}`);
});
