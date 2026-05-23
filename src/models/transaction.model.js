import mongoose, { Schema } from "mongoose";

const transactionSchema = new mongoose.Schema({
    runId : {
        type : String,
        required : true
    },
    source : {
        type : String,
        enum : ['USER', 'EXCHANGE'],
        required : true
    },
    transactionId : {
        type : String,
    },
    timestamp : {
        type : Date,
    },
    type : {
        type : String,
    },
    asset : {
        type : String,
    },
    normalizedAsset : {
        type : String,
    },
    quantity : {
        type : Number,
    },
    priceUsd : {
        type : Number,
    },
    fee : {
        type : Number,
    },
    note : {
        type : String,
    },
    rawData : {
        type : Schema.Types.Mixed,
        required : true
    },
    validationErrors : [
        {
            type:String
        }
    ],
    isValid : {
        type : Boolean,
        default : true
    },
    matched : {
        type : Boolean,
        default : false
    },
    
    
} , {timestamps : true})

export default mongoose.model("Transaction", transactionSchema)


