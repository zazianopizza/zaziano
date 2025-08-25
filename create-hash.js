// backend/create-hash.js
import bcrypt from 'bcrypt'; // ← نستخدمه لتشفير كلمة المرور

const password = 'admin123'; // ← يمكنك تغييرها
bcrypt.hash(password, 10, (err, hash) => {
  if (err) throw err;
  console.log('Hashed Password:', hash);
});