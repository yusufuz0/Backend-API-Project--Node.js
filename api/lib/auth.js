const passport = require("passport");
const { ExtractJwt, Strategy } = require("passport-jwt");
const db = require("../db/firebase");
const config = require("../config");
const privs = require("../config/role_privileges");
const Response = require("./Response");
const { HTTP_CODES } = require("../config/Enum");
const CustomError = require("./Error");



module.exports = function () {
    let strategy = new Strategy({
        secretOrKey: config.JWT.SECRET,
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
    }, async (payload, done) => {
        try {
            // Kullanıcıyı Firestore'dan bulma
            let userDoc = await db.collection('Users').doc(payload.id).get();            
            if (!userDoc.exists) {
                return done(new Error("User not found"), null);
            }
            
            let user = userDoc.data();

            // Kullanıcının rollerini almak
            let userRolesSnapshot = await db.collection('UserRoles').where('user_id', '==', payload.id).get();
            let userRoles = userRolesSnapshot.docs.map(doc => doc.data());

            // Rollere ait yetkileri almak
            let roleIds = userRoles.map(ur => ur.role_id);
            let rolePrivilegesSnapshot = await db.collection('RolePrivileges').where('role_id', 'in', roleIds).get();
            let rolePrivileges = rolePrivilegesSnapshot.docs.map(doc => doc.data());

            // Yetkileri almak
            let privileges = rolePrivileges.map(rp => privs.privileges.find(x => x.key === rp.permission));

            // Kullanıcı bilgilerini döndürmek
            done(null, {
                id: user.id,
                roles: privileges,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                exp: parseInt(Date.now() / 1000) + config.JWT.EXPIRE_TIME
            });

        } catch (err) {
            done(err, null);
        }
    });

    passport.use(strategy);

    return {
        initialize: function () {
            return passport.initialize();
        },
        authenticate: function () {
            return passport.authenticate("jwt", { session: false });
        },

        checkRoles: (...expectedRoles) => {
            return (req, res, next) => {

                let i = 0;
                let privileges = req.user.roles.filter(x => x).map(x => x.key);

                while (i < expectedRoles.length && !privileges.includes(expectedRoles[i])) i++;

                if (i >= expectedRoles.length) {
                    let response = Response.errorResponse(new CustomError(HTTP_CODES.UNAUTHORIZED, "Need Permission", "Need Permission"));
                    return res.status(response.code).json(response);
                }

                return next(); // Authorized

            }
        }

    };
};
