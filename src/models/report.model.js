import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  runId: { type: String, required: true, unique: true },
  summary: {
    matched: Number,
    conflicting: Number,
    unmatchedUser: Number,
    unmatchedExchange: Number
  },
  matched: [mongoose.Schema.Types.Mixed],
  conflicting: [mongoose.Schema.Types.Mixed],
  unmatchedUser: [mongoose.Schema.Types.Mixed],
  unmatchedExchange: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });

export default mongoose.model('Report', reportSchema);
