// backend/models/OpeningHours.js
import mongoose from 'mongoose';

const openingHoursSchema = new mongoose.Schema({
  schedule: {
    type: Object,
    required: true,
    default: {
      monday: { open: false, openingTime: "12:00", closingTime: "23:59", breakStart: null, breakEnd: null },
      tuesday: { open: true, openingTime: "11:00", closingTime: "23:59", breakStart: null, breakEnd: null },
      wednesday: { open: true, openingTime: "11:00", closingTime: "23:59", breakStart: null, breakEnd: null },
      thursday: { open: true, openingTime: "11:00", closingTime: "23:59", breakStart: null, breakEnd: null },
      friday: { open: true, openingTime: "11:00", closingTime: "00:59", breakStart: null, breakEnd: null },
      saturday: { open: true, openingTime: "11:00", closingTime: "00:59", breakStart: null, breakEnd: null },
      sunday: { open: true, openingTime: "11:00", closingTime: "21:00", breakStart: null, breakEnd: null }
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  // ❌ لا تستخدم _id: false — دع MongoDB يُنشئه تلقائيًا
  timestamps: false
});

// ✅ احذف هذا السطر تمامًا — لأنه غير ضروري ويتسبب في تحذير
// openingHoursSchema.index({ _id: 1 }, { unique: true });

export default mongoose.model('OpeningHours', openingHoursSchema);