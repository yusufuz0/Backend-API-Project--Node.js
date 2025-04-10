var express = require('express');
var router = express.Router();
const db = require("../db/firebase");
const Response = require('../lib/Response');
const CustomError = require('../lib/Error');
const Enum = require('../config/Enum');
const AuditLogs = require('../lib/AuditLogs');
const logger = require("../lib/logger/LoggerClass");
const auth = require("../lib/auth")();
const config = require("../config");
const i18n = new (require("../lib/i18n"))(config.DEFAULT_LANG)
const emitter = require("../lib/Emitter");
const excelExport = new (require("../lib/Export"))();
const fs = require("fs");




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
        if (!body.name) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["name"]));
        
        const categoryRef = db.collection("Categories").doc();
        await categoryRef.set({
          name: body.name,
          is_active: true,
          created_by: req.user?.email ?? " ",
          created_at: new Date(),
          updated_at: new Date(),
        });
        
        // Yeni eklenen veriyi al
        const newCategory = await categoryRef.get();
        
        AuditLogs.info(req.user?.email ?? " ",  "Categories", "Add", newCategory.data());
        logger.info(req.user?.email ?? " ", "Categories", "Add", JSON.stringify(newCategory.data(), null, 2));
        emitter.getEmitter("notifications").emit("messages", {message: newCategory.data().name + " is added" });

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
        if (!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["id"]));

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
        if (!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["id"]));
        
        await db.collection('Categories').doc(body.id).delete();

        AuditLogs.info(req.user?.email ?? " ", "Categories", "Delete", { id: body.id });

        res.json(Response.successResponse({success: true}));
    } 
    
    catch (err) {
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(errorResponse);
    }
});

router.post('/export', auth.checkRoles("category_export") , async (req, res) => {

    try {
        const snapshot = await db.collection("Categories").get();
        const categories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        
        const formattedCategories = categories.map(cat => ({
            ...cat,
            created_at: cat.created_at ? cat.created_at.toDate().toLocaleDateString('tr-TR') : "",
            updated_at: cat.updated_at ? cat.updated_at.toDate().toLocaleDateString('tr-TR') : ""
        }));
    
        let excel = excelExport.toExcel(
            ["NAME", "IS ACTIVEE", "USER EMAİL", "CREATED AT", "UPDATED AT"],
            ["name", "is_active", "created_by", "created_at", "updated_at"],
            formattedCategories
        );
        
        let filePath = __dirname + "/../tmp/categories_excel_" + Date.now() + ".xlsx";
        fs.writeFileSync(filePath, excel, "UTF-8");  

        res.download(filePath);

       // fs.unlinkSync(filePath);
    
        } 
        catch (err) {
            let errorResponse = Response.errorResponse(err);
            res.status(errorResponse.code).json(Response.errorResponse(err));
        }
});

module.exports = router;
