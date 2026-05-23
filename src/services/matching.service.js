import Transaction from '../models/transaction.model.js';

const getEquivalentExchangeType = (userType) => {
  if (userType === 'TRANSFER_OUT') return 'TRANSFER_IN';
  if (userType === 'TRANSFER_IN') return 'TRANSFER_OUT';
  return userType; // BUY and SELL remain the same
};


export const runMatchingEngine = async (runId, config) => {
  // Default tolerances if not provided in the API request
  const timestampToleranceMs = (config.timestampToleranceSeconds || 300) * 1000;
  const quantityTolerancePct = config.quantityTolerancePct || 0.01;

  // 1. Fetch all VALID transactions for this run
  const userTxns = await Transaction.find({ runId, source: 'USER', isValid: true });
  let exchangeTxns = await Transaction.find({ runId, source: 'EXCHANGE', isValid: true });

  const report = {
    matched: [],
    conflicting: [],
    unmatchedUser: [],
    unmatchedExchange: []
  };

  // 2. Loop through User Transactions
  for (const userTx of userTxns) {
    const equivalentType = getEquivalentExchangeType(userTx.type);

    // Find ALL exchange transactions that match the basic criteria (Asset and Type)
    const potentialMatches = exchangeTxns.filter(exTx => 
      !exTx.matched && 
      (exTx.normalizedAsset === userTx.normalizedAsset || exTx.asset === userTx.asset) &&
      exTx.type === equivalentType
    );

    let bestMatch = null;
    let isConflicting = false;
    let conflictReason = "";

    // 3. Evaluate potential matches using tolerances
    for (const exTx of potentialMatches) {
      // Calculate differences
      const timeDiffMs = Math.abs(userTx.timestamp.getTime() - exTx.timestamp.getTime());
      
      const qtyDiff = Math.abs(userTx.quantity - exTx.quantity);
      const qtyDiffPct = userTx.quantity === 0 ? 0 : (qtyDiff / userTx.quantity);

      // Check if it's an exact/perfect match within tolerance
      if (timeDiffMs <= timestampToleranceMs && qtyDiffPct <= quantityTolerancePct) {
        bestMatch = exTx;
        isConflicting = false;
        break; // Found a perfect match!
      } 
      // If it shares the exact same Transaction ID, but fails tolerance, it's conflicting!
      else if (userTx.transactionId && userTx.transactionId === exTx.transactionId) {
         bestMatch = exTx;
         isConflicting = true;
         conflictReason = "Matched by ID, but values outside tolerance limits";
         break;
      }
      // Or if time is really close but quantity is wildly off, it might be a conflict. 
      // (You can expand your conflict logic here based on your plan.md Step 5 Match Scoring)
    }

    // 4. Categorize the result
    if (bestMatch && !isConflicting) {
      // Mark as matched so we don't use it again
      bestMatch.matched = true;
      userTx.matched = true;

      report.matched.push({
        userTransaction: userTx,
        exchangeTransaction: bestMatch
      });

      // Remove the matched exchange transaction from the pool to optimize future loops
      exchangeTxns = exchangeTxns.filter(ex => ex._id.toString() !== bestMatch._id.toString());
    } 
    else if (bestMatch && isConflicting) {
      bestMatch.matched = true;
      userTx.matched = true;

      report.conflicting.push({
        userTransaction: userTx,
        exchangeTransaction: bestMatch,
        reason: conflictReason
      });

      exchangeTxns = exchangeTxns.filter(ex => ex._id.toString() !== bestMatch._id.toString());
    } 
    else {
      report.unmatchedUser.push({
        userTransaction: userTx,
        reason: "No matching exchange transaction found"
      });
    }
  }

  // 5. Any exchange transactions left over are unmatched
  const remainingExchangeTxns = exchangeTxns.filter(ex => !ex.matched);
  for (const exTx of remainingExchangeTxns) {
    report.unmatchedExchange.push({
      exchangeTransaction: exTx,
      reason: "No matching user transaction found"
    });
  }

  return report;
};
