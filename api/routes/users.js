var express = require('express');
var router = express.Router();
const db = require("../db/firebase");
const Response = require('../lib/Response');
const CustomError = require('../lib/Error');
const Enum = require('../config/Enum');
const config = require('../config');
const { FieldPath } = require("firebase-admin/firestore"); // Firestore'dan FieldPath'i içe aktarın
const bcrypt = require("bcrypt-nodejs");
const is = require("is_js");
const jwt = require("jwt-simple");
const auth = require("../lib/auth")();
const i18n = new (require("../lib/i18n"))(config.DEFAULT_LANG)
const {rateLimit} = require("express-rate-limit");
const FirestoreRateLimitStore = require("../lib/FirestoreRateLimitStore");

const limiter = rateLimit({
	windowMs: 2 * 60 * 1000, // 15 minutes
	limit: 5, // Limit each IP to 5 requests per `window` (here, per 15 minutes).
	//standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  store: new FirestoreRateLimitStore({ windowMs: 2 * 60 * 1000 }),
})



router.all("*", (req, res, next) => {
  // Şu yolları bypass et:
  const excludedPaths = ["/register", "/auth"];
  if (excludedPaths.includes(req.path)) {
      return next(); // auth.authenticate atlanır
  }

  return auth.authenticate()(req, res, next);
});



router.post('/register', async (req, res) => {
  try {
    let body = req.body;

    const snapshot = await db.collection("Users").get();

    if (snapshot.docs.length > 0) {

      return res.sendStatus(Enum.HTTP_CODES.NOT_FOUND);
    }
    

    if (!body.email) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", config.DEFAULT_LANG) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", config.DEFAULT_LANG, ["email"]));

    if (!is.email(body.email)) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", config.DEFAULT_LANG) , i18n.translate("COMMON.FIELD_MUST_BE_AN_PROPER_FORMAT", config.DEFAULT_LANG, ["email"]));

    if (!body.password) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", config.DEFAULT_LANG) , i18n.translate("COMMON.FIELD_MUST_BE_FILLED", config.DEFAULT_LANG, ["password"]));

    if (body.password.length < Enum.PASS_LENGHT) {
      throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", config.DEFAULT_LANG), i18n.translate("USERS.PASSWORD_LENGTH_ERROR", config.DEFAULT_LANG, [Enum.PASS_LENGHT]));
    }

    // Check if the email already exists
    const existingUserSnapshot = await db.collection("Users")
      .where("email", "==", body.email)
      .get();

    if (!existingUserSnapshot.empty) {
      throw new CustomError(Enum.HTTP_CODES.CONFLICT,  i18n.translate("COMMON.DUPLICATE_ERROR", config.DEFAULT_LANG) , i18n.translate("COMMON.THIS_ALREADY_EXIST", req.user.language, ["email"]));
    }

    let password = bcrypt.hashSync(body.password, bcrypt.genSaltSync(8), null);

    const userRef = db.collection("Users").doc();
    await userRef.set({
      email: body.email,
      password: password,
      is_active: true,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      phone_number: req.body.phone_number,
      created_at: new Date(),
      updated_at: new Date(),
    });

    let roleRef = db.collection("Roles").doc();
    await roleRef.set({
      role_name: Enum.SUPER_ADMIN,
      is_active: true,
      created_by: userRef.id,
      created_at: new Date(),
      updated_at: new Date(),
    });


    let userRoleRef = db.collection("UserRoles").doc();
    await userRoleRef.set({
      user_id: userRef.id,
      role_id: roleRef.id,
      created_at: new Date(),
      updated_at: new Date(),
    });


    res.status(Enum.HTTP_CODES.CREATED).json(Response.successResponse({ success: true }, Enum.HTTP_CODES.CREATED));

  } catch (err) {
    let errorResponse = Response.errorResponse(err);
    res.status(errorResponse.code).json(Response.errorResponse(err));
  }
});


router.post("/auth",limiter, async(req, res) => {

  try {

    let {email, password} = req.body;

    if (typeof password !== "string" || password.length < Enum.PASS_LENGHT || is.not.email(email)) {
      throw new CustomError(Enum.HTTP_CODES.UNAUTHORIZED, i18n.translate("COMMON.VALIDATION_ERROR_TITLE",config.DEFAULT_LANG) , i18n.translate("USERS.AUTH_ERROR",config.DEFAULT_LANG));
    }

    let snapshot = await db.collection("Users").where("email", "==", email).get();
    let user = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    user = user[0];

    if(!user) throw new CustomError(Enum.HTTP_CODES.UNAUTHORIZED, i18n.translate("COMMON.VALIDATION_ERROR_TITLE",config.DEFAULT_LANG) , i18n.translate("USERS.AUTH_ERROR",config.DEFAULT_LANG));

    const validPassword = await bcrypt.compareSync(password, user.password);
    if (!validPassword) throw new CustomError(Enum.HTTP_CODES.UNAUTHORIZED, i18n.translate("COMMON.VALIDATION_ERROR_TITLE",config.DEFAULT_LANG) ,i18n.translate("USERS.AUTH_ERROR",config.DEFAULT_LANG));
    
    let payload = {
      id : user.id,
      exp : parseInt(Date.now() / 1000) + config.JWT.EXPIRE_TIME
    }

    let token = jwt.encode(payload, config.JWT.SECRET);

    let userData = {
      id: user.id,
      first_name: user.first_name,
      last_name:  user.last_name,
    }


    res.json(Response.successResponse({token, user: userData}));
    
  } 

  catch (err) {
    let errorResponse = Response.errorResponse(err);
    res.status(errorResponse.code).json(Response.errorResponse(err));
  }
});



router.get('/', auth.checkRoles("user_view"), async (req, res, next) => {
  try {
    const snapshot = await db.collection("Users").get();
    const users = snapshot.docs.map((doc) => {
      const { password, ...rest } = doc.data(); // password'u ayır
      return { id: doc.id, ...rest }; // sadece kalan alanları döndür
    });

    for (let i = 0; i < users.length; i++) {
      const rolesSnapshot = await db.collection("UserRoles")
        .where("user_id", "==", users[i].id)
        .get();
    
      const roles = [];
    
      for (const roleDoc of rolesSnapshot.docs) {
        const roleData = roleDoc.data();
    
        // role_id ile rol dokümanını çekiyoruz (select kullanmadan)
        const roleRef = await db.collection("Roles").doc(roleData.role_id).get();
    
        if (roleRef.exists) {
          const role = roleRef.data();
    
          // sadece role_name alıyoruz
          roles.push({
            role_name: role.role_name
          });
        }
      }
    
      users[i].roles = roles;
    }
 
    res.json(Response.successResponse(users));
  } 
  catch (err) {
    const errorResponse = Response.errorResponse(err);
    res.status(errorResponse.code).json(errorResponse);   
  }
});



router.post('/add',auth.checkRoles("user_add"),  async (req, res) => {
  let body = req.body;
  try {
    if (!body.email) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST,  i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language), i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["email"]));

    if (!is.email(body.email)) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language),  i18n.translate("COMMON.FIELD_MUST_BE_AN_PROPER_FORMAT", req.user.language, ["email"]));

    if (!body.password) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language),  i18n.translate("COMMON.FIELD_MUST_BE_AN_PROPER_FORMAT", req.user.language, ["password"]));

    if (body.password.length < Enum.PASS_LENGHT) {
      throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language), i18n.translate("COMMON.PASSWORD_FIELD_MUST_BE_GREATER_THAN_CHARACTERS", req.user.language, [Enum.PASS_LENGHT]));
    }

    // Check if the email already exists
    const existingUserSnapshot = await db.collection("Users")
      .where("email", "==", body.email)
      .get();

    if (!existingUserSnapshot.empty) {
      throw new CustomError(Enum.HTTP_CODES.CONFLICT, i18n.translate("COMMON.DUPLICATE_ERROR", req.user.language) , i18n.translate("COMMON.THIS_ALREADY_EXIST", req.user.language, ["email"]));
    }


    if(!body.roles  || !Array.isArray(body.roles) || body.roles.length == 0){
      throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST, i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language), i18n.translate("COMMON.FIELD_MUST_BE_TYPE", req.user.language, ["roles", "array"]));
    }

    
    let snapshot = await db.collection("Roles").where(FieldPath.documentId(), "in", body.roles).get();
    const roles = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if(roles.length == 0){
      throw new CustomError(Enum.HTTP_CODES.NOT_FOUND,  i18n.translate("COMMON.NOT_FOUND_ERROR", req.user.language), i18n.translate("COMMON.NOT_FOUND", req.user.language, ["roles"]));
    }



    let password = bcrypt.hashSync(body.password, bcrypt.genSaltSync(8), null);

    const userRef = db.collection("Users").doc();
    await userRef.set({
      email: body.email,
      password: password,
      is_active: true,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      phone_number: req.body.phone_number,
      created_at: new Date(),
      updated_at: new Date(),
    });


    for (let i = 0; i < roles.length; i++) {
        await db.collection("UserRoles").doc().set({
          user_id: userRef.id,
          role_id: roles[i].id,
          created_at: new Date(),
          updated_at: new Date(),
        });
    }

    res.status(Enum.HTTP_CODES.CREATED).json(Response.successResponse({ success: true }, Enum.HTTP_CODES.CREATED));

  } catch (err) {
    let errorResponse = Response.errorResponse(err);
    res.status(errorResponse.code).json(Response.errorResponse(err));
  }
});


router.post('/update', auth.checkRoles("user_update"), async (req, res) => {
  try {
    let body = req.body;
    let updates = {};

    if(!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST,  i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language), i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["id"]));

    if(body.password && body.password.length >= Enum.PASS_LENGHT){
      updates.password = bcrypt.hashSync(body.password, bcrypt.genSaltSync(8), null);
    }
    if(typeof body.is_active === "boolean") updates.is_active = body.is_active;
    if(body.first_name) updates.first_name = body.first_name;
    if(body.last_name) updates.last_name = body.last_name;
    if(body.phone_number) updates.phone_number = body.phone_number;
    updates.updated_at = new Date();

    if (body._id == req.user.id) {
      // throw new CustomError(Enum.HTTP_CODES.FORBIDDEN, i18n.translate("COMMON.NEED_PERMISSIONS", req.user.language), i18n.translate("COMMON.NEED_PERMISSIONS", req.user.language))
      body.roles = null;
    }

    if(Array.isArray(body.roles) && body.roles.length > 0){

      const snapshot = await db.collection("UserRoles")
      .where("user_id", "==", body.id)
      .get();

      let userRoles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      let removedRoles = userRoles.filter(x => !body.roles.includes(x.role_id));
      let newRoles = body.roles.filter(x => !userRoles.map(r => r.role_id).includes(x));


      if (removedRoles.length > 0) {
          const batch = db.batch();
          removedRoles.forEach(perm => {
              const permRef = db.collection("UserRoles").doc(perm.id);  
              batch.delete(permRef);  
          });
          await batch.commit();
      }

      if (newRoles.length > 0) {
          const batch = db.batch();
          newRoles.forEach(role => {
              const newRole = db.collection("UserRoles").doc();  
              const newRoleData = {
                  role_id: role,
                  user_id: body.id,
                  created_at: new Date(),
                  updated_at: new Date(),
              };
              batch.set(newRole, newRoleData);  
          });
          await batch.commit();  
      }
    }

    

    await db.collection("Users").doc(body.id).update(updates);

    res.json(Response.successResponse({ success: true }));

  } 
  catch (err) {
    let errorResponse = Response.errorResponse(err);
    res.status(errorResponse.code).json(Response.errorResponse(err));
  }
})


router.post('/delete', auth.checkRoles("user_delete"), async (req, res) => {
  try {
    let body = req.body;

    if (!body.id) throw new CustomError(Enum.HTTP_CODES.BAD_REQUEST,i18n.translate("COMMON.VALIDATION_ERROR_TITLE", req.user.language), i18n.translate("COMMON.FIELD_MUST_BE_FILLED", req.user.language, ["id"]));

    const batch = db.batch();

    const snapshot = await db.collection('UserRoles').where('user_id', '==', body.id).get();
    
    // Her bir kaydı silmek için batch işlemine ekle
    snapshot.forEach(doc => {
        batch.delete(doc.ref);
    });


    const roleRef = db.collection('Users').doc(body.id);
    batch.delete(roleRef);

    // Toplu işlemi tamamla
    await batch.commit();

    res.json(Response.successResponse({success: true}));

  } catch (err) {
    let errorResponse = Response.errorResponse(err);
    res.status(errorResponse.code).json(Response.errorResponse(err));
  }
});


module.exports = router;
