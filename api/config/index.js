module.exports = {
    "PORT": process.env.PORT || "3000",
    "LOG_LEVEL": process.env.LOG_LEVEL || "debug",
    "JWT": {
        "SECRET": process.env.JWT_SECRET || "sdflmsdflmsdlfişdsfilsdilfs66s456d4f56s465df465sdhjkhg4fsdlfkmçkmsdkjgs179179asdghjkhsdfgdsfgdsfgfds46g456ds4fg65sd2f1g3d54fg848hjg5hjgh534j6fghn32vb1n53fh4j65fhhn32fghjgjkcbntgdf8797f65sdd1v2sa68df4g",
        "EXPIRE_TIME": !isNaN(parseInt(process.env.TOKEN_EXPIRE_TIME)) ? parseInt(process.env.TOKEN_EXPIRE_TIME) : 24 * 60 * 60 // 86400
        
    },
    "FILE_UPLOAD_PATH": process.env.FILE_UPLOAD_PATH,
    "DEFAULT_LANG": process.env.DEFAULT_LANG || "EN",
}