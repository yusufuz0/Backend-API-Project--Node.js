const xlsx = require("node-xlsx");
const CustomError = require("../lib/Error");
const {HTTP_CODES} = require("../config/Enum");

class Import {


    constructor() {

    }


  
    fromExcel(filePath) {

        let worksheets = xlsx.parse(filePath);

        if (!worksheets||worksheets.length == 0 ) throw new CustomError(HTTP_CODES.BAD_REQUEST, "Invalid Excel Format","Invalid Excel Format");

        let rows = worksheets[0].data;
        if(rows?.length == 0) throw new CustomError(HTTP_CODES.NOT_ACCEPTABLE, "File is empty","Excel file is empty");

        return rows;

    }

}

module.exports = Import;