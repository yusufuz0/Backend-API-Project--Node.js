var express = require('express');
var router = express.Router();
const Response = require('../lib/Response');
const moment = require("moment");
const db = require("../db/firebase");
const auth = require("../lib/auth")();


/*
1. Audit logs tablosunda işlem yapan kişilerin hangi tip işlemi kaç kez yaptığını veren bir sorgu.
2. Kategori tablosunda tekil veri sayısı.
3. Sistemde tanımlı kaç kullanıcı var?
*/


router.all("*", auth.authenticate(), (req, res, next) => {
    next();
});


router.post("/auditlogs", async (req, res) => {
    try {
        const body = req.body;
        const auditLogsRef = db.collection('AuditLogs');
        let query = auditLogsRef;

        // Eğer location filtresi varsa uygula
        if (typeof body.location === "string") {
            query = query.where('location', '==', body.location);
        }

        const snapshot = await query.get();

        let aggregation = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const key = `${data.email}_${data.proc_type}`;

            if (aggregation[key]) {
                aggregation[key].count += 1;
            } else {
                aggregation[key] = {
                    email: data.email,
                    proc_type: data.proc_type,
                    count: 1
                };
            }
        });

        // Object.values ile aggregation sonuçlarını array yapıyoruz
        let result = Object.values(aggregation);

        // count'a göre azalan sıralama
        result.sort((a, b) => b.count - a.count);

        res.json(Response.successResponse(result));

    } catch (err) {
        let errorResponse = Response.errorResponse(err, req.user?.language ?? "EN");
        res.status(errorResponse.code).json(errorResponse);
    }
});



router.post("/categories/unique", async (req, res) => {
    try {
        let body = req.body;
        let categoriesRef = db.collection('Categories');
        let query = categoriesRef;

        // Eğer is_active filtresi varsa uygula
        if (typeof body.is_active === "boolean") {
            query = query.where('is_active', '==', body.is_active);
        }

        const snapshot = await query.get();

        let namesSet = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.name) {
                namesSet.add(data.name);
            }
        });

        let result = Array.from(namesSet);

        res.json(Response.successResponse({ result, count: result.length }));

    } catch (err) {
        let errorResponse = Response.errorResponse(err, req.user?.language ?? "EN");
        res.status(errorResponse.code).json(errorResponse);
    }
});



router.post("/users/count", async (req, res) => {
    try {
        let body = req.body;
        let usersRef = db.collection('Users');
        let query = usersRef;

        // Eğer is_active filtresi varsa uygula
        if (typeof body.is_active === "boolean") {
            query = query.where('is_active', '==', body.is_active);
        }

        const snapshot = await query.get();

        // Snapshot size, dönen kayıt sayısını verir
        const count = snapshot.size;

        res.json(Response.successResponse(count));

    } catch (err) {
        let errorResponse = Response.errorResponse(err, req.user?.language ?? "EN");
        res.status(errorResponse.code).json(errorResponse);
    }
});



module.exports = router;
