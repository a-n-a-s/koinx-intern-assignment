import path from 'path';
import { v4 as uuidv4 } from 'uuid'; 
import { ingestCSV } from '../services/ingestion.service.js';
import { runMatchingEngine } from '../services/matching.service.js';
import Report from '../models/report.model.js';

export const runReconciliation = async (req, res, next) => {
  try {
    
    const runId = uuidv4();

    
    const userFilePath = path.join(process.cwd(), '../../user_transactions.csv');
    const exchangeFilePath = path.join(process.cwd(), '../../exchange_transactions.csv');

    
    console.log(`Starting ingestion for run: ${runId}`);
    
    await Promise.all([
      ingestCSV(userFilePath, 'USER', runId),
      ingestCSV(exchangeFilePath, 'EXCHANGE', runId)
    ]);

    console.log(`Ingestion complete for run: ${runId}`);

    console.log(`Starting matching engine...`);
    
const config = {
   timestampToleranceSeconds: req.body?.timestampToleranceSeconds || process.env.TIMESTAMP_TOLERANCE_SECONDS,
   quantityTolerancePct: req.body?.quantityTolerancePct || process.env.QUANTITY_TOLERANCE_PCT
};

console.log(config);

const reportData = await runMatchingEngine(runId, config);
// For now, let's just log the summary of the report to the console!
console.log('--- RECONCILIATION SUMMARY ---');
console.log(`Matched: ${reportData.matched.length}`);
console.log(`Conflicting: ${reportData.conflicting.length}`);
console.log(`Unmatched (User): ${reportData.unmatchedUser.length}`);
console.log(`Unmatched (Exchange): ${reportData.unmatchedExchange.length}`);

const newReport = new Report({
  runId: runId,
  summary: {
    matched: reportData.matched.length,
    conflicting: reportData.conflicting.length,
    unmatchedUser: reportData.unmatchedUser.length,
    unmatchedExchange: reportData.unmatchedExchange.length
  },
  matched: reportData.matched,
  conflicting: reportData.conflicting,
  unmatchedUser: reportData.unmatchedUser,
  unmatchedExchange: reportData.unmatchedExchange
});
await newReport.save();

    // 4. Return success response
    res.status(202).json({
      success: true,
      message: 'Reconciliation process started',
      runId: runId
    });

  } catch (error) {
    console.error('Reconciliation Error:', error);
    next(error); // Passes the error to the global error handler in app.js
  }
};


// GET /api/report/:runId
export const getReport = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const report = await Report.findOne({ runId });
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};
// GET /api/report/:runId/summary
export const getReportSummary = async (req, res, next) => {
  try {
    const { runId } = req.params;
    // .select('summary') tells Mongoose to ONLY fetch the summary object, saving massive amounts of bandwidth!
    const report = await Report.findOne({ runId }).select('summary');
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.status(200).json({ success: true, data: report.summary });
  } catch (error) {
    next(error);
  }
};
// GET /api/report/:runId/unmatched
export const getReportUnmatched = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const report = await Report.findOne({ runId }).select('unmatchedUser unmatchedExchange');
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.status(200).json({
      success: true,
      data: {
        unmatchedUser: report.unmatchedUser,
        unmatchedExchange: report.unmatchedExchange
      }
    });
  } catch (error) {
    next(error);
  }
};