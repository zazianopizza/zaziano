// backend/models/Settings.js
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  deliveryFee: {
    type: Number,
    required: true,
    default: 5.00,
    min: 0,
    max: 999.99
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  // ❌ لا تستخدم _id: false — دع MongoDB يُنشئه تلقائيًا
  timestamps: false
});

// ✅ فهرس على _id (غير ضروري لكن آمن)
// لا نحتاج فهرس خاص لأننا سنستخدم findOne فقط

export default mongoose.model('Settings', settingsSchema);