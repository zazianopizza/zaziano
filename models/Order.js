// backend/models/Order.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  id: {
    type: Number, // ← سنستخدم Date.now() كـ ID — لكنه رقم
    required: true,
    index: true
  },
  customer: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String }
  },
  address: {
    street: { type: String },
    houseNumber: { type: String },
    floor: { type: String },
    zipCode: { type: String },
    city: { type: String }
  },
  delivery: {
    type: { type: String }, // "delivery" أو "pickup"
    notes: { type: String },
    pickupTimeOption: { type: String },
    pickupTime: { type: String },
    preorderTime: { type: String }
  },
  payment: {
    method: { type: String }
  },
  items: [{
    id: { type: Number, required: true },
    name: { type: String },
    sizeLabel: { type: String },
    quantity: { type: Number },
    basePrice: { type: Number },
    totalPrice: { type: Number },
    image: { type: String },
    extras: [{
      id: { type: Number },
      name: { type: String },
      price: { type: Number },
      quantity: { type: Number }
    }]
  }],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// ✅ فهرس فريد على id (لأننا نستخدمه كمعرف)
orderSchema.index({ id: 1 }, { unique: true });

export default mongoose.model('Order', orderSchema);