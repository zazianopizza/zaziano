// backend/models/Product.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
    index: true
  },
  section: {
    type: String,
    required: true,
    index: true
  },
  order: { // ← جديد: ترتيب القسم
    type: Number,
    default: 0
  },
  data: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

// ✅ فهرس فريد على section + id
productSchema.index({ section: 1, id: 1 }, { unique: true });

export default mongoose.model('Product', productSchema);