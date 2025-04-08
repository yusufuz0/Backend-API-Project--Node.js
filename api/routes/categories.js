var express = require('express');
var router = express.Router();
const db = require("../db/firebase");
const Response = require('../lib/Response');
const CustomError = require('../lib/Error');
const Enum = require('../config/Enum');
const AuditLogs = require('../lib/AuditLogs');
const logger = require("../lib/logger/LoggerClass");
const auth = require("../lib/auth")();


router.all("*", auth.authenticate(), (req, res, next) => {
    next();
});


router.get("/", auth.checkRoles("category_view") ,async (req, res) => {
  try {
    const snapshot = await db.collection("Categories").get();
    const categories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        res.json(Response.successResponse(categories));

    } catch (err) {
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(Response.errorResponse(err));
    }
});



router.post('/add', auth.checkRoles("category_add") ,async (req, res) => {  
    let body = req.body;
    try {
        if (!body.name) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, 'Validation Error!', 'Name field must be filled');
        
        const categoryRef = db.collection("Categories").doc();
        await categoryRef.set({
          name: body.name,
          is_active: true,
          created_by: 1,
          created_at: new Date(),
          updated_at: new Date(),
        });
        
        // Yeni eklenen veriyi al
        const newCategory = await categoryRef.get();
        
        AuditLogs.info(req.user?.email ?? " ",  "Categories", "Add", newCategory.data());
        logger.info(req.user?.email ?? " ", "Categories", "Add", JSON.stringify(newCategory.data(), null, 2));

        res.json(Response.successResponse({success: true}));
    } 
    catch (err) {
        logger.error(req.user?.email ?? " ", "Categories", "Add", err);
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(errorResponse);
    }
});


router.post('/update', auth.checkRoles("category_update") , async (req, res) => {  
    let body = req.body;
    try {
        if (!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, 'Validation Error!', 'id field must be filled');

        let updates = {};
        
        if (body.name) updates.name = body.name;
        if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
        if (body.created_by) updates.created_by = body.created_by;
        updates.updated_at = new Date();

        await db.collection('Categories').doc(body.id).update(updates);

        AuditLogs.info(req.user?.email ?? " ", "Categories", "Update", { id: body.id, ...updates });

        res.json(Response.successResponse({success: true}));
      }
      
      catch (err) {
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(errorResponse);
      }
    
});



router.post('/delete', auth.checkRoles("category_delete") , async (req, res) => {
    let body = req.body;
    try {
        if (!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, 'Validation Error!', 'id field must be filled');
        
        await db.collection('Categories').doc(body.id).delete();

        AuditLogs.info(req.user?.email ?? " ", "Categories", "Delete", { id: body.id });

        res.json(Response.successResponse({success: true}));
    } 
    
    catch (err) {
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(errorResponse);
    }
});



module.exports = router;
