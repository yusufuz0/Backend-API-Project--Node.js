const db = require("../db/firebase");
const Enum = require("../config/Enum");


let instance = null;

class AuditLogs {
    constructor() {
        if (!instance) {
            instance = this;
        }
        return instance;
    }

    info(email, location, proc_type, log) {
        this.#saveToDB({
            level: Enum.LOG_LEVELS.INFO,
            email, location, proc_type, log
        });
    }

    warn(email, location, proc_type, log) {
        this.#saveToDB({
            level: Enum.LOG_LEVELS.WARN,
            email, location, proc_type, log
        });
    }

    error(email, location, proc_type, log) {
        this.#saveToDB({
            level: Enum.LOG_LEVELS.ERROR,
            email, location, proc_type, log
        });
    }

    debug(email, location, proc_type, log) {
        this.#saveToDB({
            level: Enum.LOG_LEVELS.DEBUG,
            email, location, proc_type, log
        });
    }

    verbose(email, location, proc_type, log) {
        this.#saveToDB({
            level: Enum.LOG_LEVELS.VERBOSE,
            email, location, proc_type, log
        });
    }

    http(email, location, proc_type, log) {
        this.#saveToDB({
            level: Enum.LOG_LEVELS.HTTP,
            email, location, proc_type, log
        });
    }

    #saveToDB({ level, email, location, proc_type, log }) {
        db.collection("AuditLogs").add({
            level,
            email,
            location,
            proc_type,
            log,
            created_at: new Date(),
            updated_at: new Date()
        })
    }
}

module.exports = new AuditLogs();
