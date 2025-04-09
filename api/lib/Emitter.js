const {EventEmitter} = require('events');


var instance = null; 

class Emitter {

    constructor() {
        if(!instance){
            this.emitters = {};
            instance = this;
        }

    }


    getEmitter(name) {
        return this.emitters[name];
        
    }

    addEmittter(name){
        this.emitters[name] = new EventEmitter();
        return this.emitters[name];

    }

}


module.exports = new Emitter();