const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

class FirestoreRateLimitStore {
  constructor(options) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // Default 15 dakika
    this.collectionName = options.collectionName || 'rateLimits';
    this.collection = db.collection(this.collectionName);
  }

  async increment(key) {
    const now = Date.now();
    const resetTime = now + this.windowMs;
    const docRef = this.collection.doc(key);
  
    const doc = await docRef.get();
    let data;
  
    if (doc.exists) {
      data = doc.data();
      // Eğer resetTime geçmişse, eski kaydı sıfırla
      if (data.resetTime < now) {
        await docRef.set({
          count: 1,
          resetTime: resetTime
        });
      } else {
        // Süre bitmediyse, istek sayısını artır
        await docRef.update({
          count: data.count + 1,
          resetTime: data.resetTime > now ? data.resetTime : resetTime,
        });
      }
    } else {
      // İlk istekte yeni kayıt oluştur
      await docRef.set({
        count: 1,
        resetTime: resetTime,
      });
    }
  
    // Güncellenen veriyi tekrar çekelim
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data();
  
    return {
      totalHits: updatedData.count,
      resetTime: new Date(updatedData.resetTime),
    };
  }
  
  async decrement(key) {
    const docRef = this.collection.doc(key);

    try {
      const doc = await docRef.get();

      if (doc.exists) {
        const data = doc.data();
        const newCount = Math.max(data.count - 1, 0);

        await docRef.update({ count: newCount });
      }
    } catch (error) {
      console.error('Error decrementing rate limit:', error);
    }
  }

  async resetKey(key) {
    const docRef = this.collection.doc(key);

    try {
      await docRef.delete();
    } catch (error) {
      console.error('Error resetting rate limit key:', error);
    }
  }
}

module.exports = FirestoreRateLimitStore;
