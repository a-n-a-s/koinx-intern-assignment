import express from 'express';
import { 
  runReconciliation, 
  getReport, 
  getReportSummary, 
  getReportUnmatched 
} from '../controllers/reconcillation.controller.js';


const router = express.Router();


router.post('/reconcile', runReconciliation);
router.get('/report/:runId', getReport);
router.get('/report/:runId/summary', getReportSummary);
router.get('/report/:runId/unmatched', getReportUnmatched);

export default router;