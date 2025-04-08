var express = require('express');
var router = express.Router();
const Response = require('../lib/Response');
const moment = require("moment");
const db = require("../db/firebase");
const auth = require("../lib/auth")();


router.all("*", auth.authenticate(), (req, res, next) => {
    next();
});


router.post("/", auth.checkRoles("auditlogs_view") ,async (req, res) => {
  try {
      let body = req.body;
      let skip = typeof body.skip === "number" ? body.skip : 0;
      let limit = typeof body.limit === "number" && body.limit <= 500 ? body.limit : 500;

      // Tarih filtresi belirleme
      const beginDate = body.begin_date ? moment(body.begin_date).toDate() : moment().subtract(1, "day").startOf("day").toDate();
      const endDate = body.end_date ? moment(body.end_date).toDate() : moment().toDate();

      // Firestore sorgusunu oluşturma
      let query = db.collection("AuditLogs")
          .where("created_at", ">=", beginDate)
          .where("created_at", "<=", endDate)
          .orderBy("created_at", "desc") // Tarihe göre sıralama
          .limit(limit); // Limit belirleme

      // Eğer `skip` değeri varsa, `startAfter` kullanarak Firestore'da sayfalama yaparız
      if (skip > 0) {
          let snapshotForSkip = await query.get();
          let docs = snapshotForSkip.docs;
          if (docs.length > skip) {
              query = query.startAfter(docs[skip - 1]);
          } else {
              return res.json(Response.successResponse([])); // Eğer `skip` fazla ise boş döneriz
          }
      }

      // Firestore sorgusunu çalıştır
      let querySnapshot = await query.get();

      // Sonuçları diziye çevir
      let auditLogs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
      }));

      res.json(Response.successResponse(auditLogs));
  } 
  catch (err) {
      let errorResponse = Response.errorResponse(err, req.user?.language ?? "EN");
      res.status(errorResponse.code).json(errorResponse);
  }
});

module.exports = router;
