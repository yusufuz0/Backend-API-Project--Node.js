var express = require('express');
var router = express.Router();
const db = require("../db/firebase");
const Response = require('../lib/Response');
const CustomError = require('../lib/Error');
const Enum = require('../config/Enum');
const role_privileges = require('../config/role_privileges');
const { FieldPath } = require("firebase-admin/firestore"); // Firestore'dan FieldPath'i içe aktarın
const auth = require("../lib/auth")();
const config = require("../config")
const i18n = new (require("../lib/i18n"))(config.DEFAULT_LANG)


router.all("*", auth.authenticate(), (req, res, next) => {
    next();
});


router.get("/", auth.checkRoles("role_view") , async (req, res) => {
    try {
      const snapshot = await db.collection("Roles").get();
      const roles = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

     for (let i = 0; i < roles.length; i++) {
        let snapshot = await db.collection("RolePrivileges").where("role_id", "==", roles[i].id).get();
        const permissions = snapshot.docs.map((doc) => {
            const { created_at, updated_at, ...rest } = doc.data();
            return { id: doc.id, ...rest };
          });
        roles[i].permissions = permissions;
     }
          res.json(Response.successResponse(roles));
  
      } catch (err) {
          let errorResponse = Response.errorResponse(err);
          res.status(errorResponse.code).json(Response.errorResponse(err));
      }
  });


  router.post('/add', auth.checkRoles("role_add") ,async (req, res) => {  
    let body = req.body;
    try {
        if (!body.role_name) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["name"]));
        if (!body.permissions || !Array.isArray(body.permissions) || body.permissions.length == 0) {

            throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language) , i18n.translate("COMMON.FIELD_MUST_BE_TYPE", req.user.langaqge, ["permissions", "array"]));
        }
        

        // Aynı role_name olup olmadığını kontrol et
        const existingRoleSnapshot = await db.collection("Roles")
            .where("role_name", "==", body.role_name)
            .get();

        if (!existingRoleSnapshot.empty) {
            throw new CustomError(Enum.HTTP_CODES.CONFLICT, i18n.translate("COMMON.DUPLICATE_ERROR", req.user.language) , i18n.translate("COMMON.THIS_ALREADY_EXIST", req.user.language, ["role name"]));
        }


        const roleRef = db.collection("Roles").doc();
        await roleRef.set({
          role_name: body.role_name,
          is_active: true,
          created_by: req.user?.email ?? " ",
          created_at: new Date(),
          updated_at: new Date(),
        });



        for (let i = 0; i < body.permissions.length; i++) {

            const RolePrivilegesRef = db.collection("RolePrivileges").doc();
            await RolePrivilegesRef.set({
                role_id: roleRef.id,
                permission: body.permissions[i],
                created_by: req.user?.email ?? " ",
                created_at: new Date(),
                updated_at: new Date(),
            });


        }
        
        res.json(Response.successResponse({success: true}));
    } 
    catch (err) {
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(errorResponse);
    }
});


router.post('/update', auth.checkRoles("role_update"), async (req, res) => {  
    let body = req.body;
    try {
        if (!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["id"]));

        let updates = {};
        
        if (body.role_name) {
            // Check if another role with the same role_name exists
            const existingRoleSnapshot = await db.collection("Roles")
                .where("role_name", "==", body.role_name)
                .where(FieldPath.documentId(), "!=", body.id) // Güncellenecek belgeyi hariç tut
                .get();

            if (!existingRoleSnapshot.empty) {
                throw new CustomError(Enum.HTTP_CODES.CONFLICT,  i18n.translate("COMMON.DUPLICATE_ERROR", req.user.language) , i18n.translate("COMMON.THIS_ALREADY_EXIST", req.user.languge, ["role name"]));
            }

            updates.role_name = body.role_name;
        }

        if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
        if (body.created_by) updates.created_by = body.created_by;
        updates.updated_at = new Date();

        if (body.permissions && Array.isArray(body.permissions) && body.permissions.length > 0) {
            const snapshot = await db.collection("RolePrivileges")
                .where("role_id", "==", body.id)
                .get();
        
            let permissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
            let removedPermissions = permissions.filter(x => !body.permissions.includes(x.permission));
            let newPermissions = body.permissions.filter(x => !permissions.map(p => p.permission).includes(x));
        
            if (removedPermissions.length > 0) {
                const batch = db.batch();
                removedPermissions.forEach(perm => {
                    const permRef = db.collection("RolePrivileges").doc(perm.id);  
                    batch.delete(permRef);  
                });
                await batch.commit();
            }
        
            if (newPermissions.length > 0) {
                const batch = db.batch();
                newPermissions.forEach(permission => {
                    const newPermission = db.collection("RolePrivileges").doc();  
                    const newPermissionData = {
                        role_id: body.id,
                        permission: permission,
                        created_by: req.user?.email ?? " ",
                        created_at: new Date(),
                        updated_at: new Date(),
                    };
                    batch.set(newPermission, newPermissionData);  
                });
                await batch.commit();  
            }
        }

        await db.collection('Roles').doc(body.id).update(updates);

        res.json(Response.successResponse({success: true}));
    } catch (err) {
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(errorResponse);
    }
});


    
router.post('/delete', auth.checkRoles("role_delete"), async (req, res) => {
    let body = req.body;
    try {
        if (!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["id"]));
        
        const batch = db.batch();

        // RolePrivileges koleksiyonundan ilgili role ait kayıtları al
        const snapshot = await db.collection('RolePrivileges').where('role_id', '==', body.id).get();
        
        // Her bir kaydı silmek için batch işlemine ekle
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Roles koleksiyonundan rolü sil
        const roleRef = db.collection('Roles').doc(body.id);
        batch.delete(roleRef);

        // Toplu işlemi tamamla
        await batch.commit();

        res.json(Response.successResponse({success: true}));
    } 
    catch (err) {
        let errorResponse = Response.errorResponse(err);
        res.status(errorResponse.code).json(errorResponse);
    }
});



router.get('/role_privileges', async (req, res) => {
    res.json(role_privileges);
});



module.exports = router;
  