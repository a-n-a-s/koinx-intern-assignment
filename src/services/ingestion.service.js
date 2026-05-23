import fs from 'fs';
import csv from 'csv-parser';
import Transaction from '../models/transaction.model.js';

// Simple validation rules
const VALID_TYPES = ['BUY', 'SELL', 'TRANSFER_OUT', 'TRANSFER_IN', 'DEPOSIT', 'WITHDRAWAL'];
const NORMALIZE_ASSET = {
  'bitcoin': 'BTC',
  'ethereum': 'ETH',
  'solana': 'SOL'
};

export const ingestCSV = (filePath, source, runId) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const validationSummary = {
      total: 0,
      valid: 0,
      invalid: 0,
      duplicateIds: [],
      errorsByType: {}
    };
    
    const seenTransactionIds = new Set();

    // Validate inputs
    if (!fs.existsSync(filePath)) {
      reject(new Error(`File not found: ${filePath}`));
      return;
    }
    
    if (!['USER', 'EXCHANGE'].includes(source)) {
      reject(new Error(`Invalid source: ${source}. Must be USER or EXCHANGE`));
      return;
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        validationSummary.total++;
        
        const validationErrors = [];
        
        // 1. Required fields check
        if (!data.transaction_id) validationErrors.push('Missing transaction_id');
        if (!data.timestamp) validationErrors.push('Missing timestamp');
        if (!data.type) validationErrors.push('Missing type');
        if (!data.asset) validationErrors.push('Missing asset');
        
        const quantity = parseFloat(data.quantity);
        if (isNaN(quantity)) validationErrors.push('Invalid quantity');
        if (quantity <= 0) validationErrors.push('Quantity must be > 0');
        
        // 2. Duplicate transaction_id check (within same file)
        if (data.transaction_id && seenTransactionIds.has(data.transaction_id)) {
          validationErrors.push(`Duplicate transaction_id in file: ${data.transaction_id}`);
          validationSummary.duplicateIds.push(data.transaction_id);
        }
        if (data.transaction_id) seenTransactionIds.add(data.transaction_id);
        
        // 3. Validate timestamp
        const timestamp = new Date(data.timestamp);
        if (isNaN(timestamp.getTime())) {
          validationErrors.push(`Invalid timestamp format: ${data.timestamp}`);
        }
        
        // 4. Validate type
        const type = data.type ? data.type.toUpperCase() : null;
        if (type && !VALID_TYPES.includes(type)) {
          validationErrors.push(`Invalid type: ${data.type}. Valid: ${VALID_TYPES.join(', ')}`);
        }
        
        // 5. Normalize asset (handle case variations)
        let normalizedAsset = data.asset ? data.asset.toUpperCase() : null;
        if (data.asset && NORMALIZE_ASSET[data.asset.toLowerCase()]) {
          normalizedAsset = NORMALIZE_ASSET[data.asset.toLowerCase()];
        }
        
        // 6. Validate price (optional for transfers)
        let priceUsd = null;
        if (data.price_usd && data.price_usd.toString().trim() !== '') {
          priceUsd = parseFloat(data.price_usd);
          if (isNaN(priceUsd)) {
            validationErrors.push(`Invalid price_usd: ${data.price_usd}`);
          }
          if (priceUsd < 0) validationErrors.push('price_usd cannot be negative');
        } else if (type === 'BUY' || type === 'SELL') {
          validationErrors.push('price_usd required for BUY/SELL transactions');
        }
        
        // 7. Validate fee
        let fee = null;
        if (data.fee && data.fee.toString().trim() !== '') {
          fee = parseFloat(data.fee);
          if (isNaN(fee)) validationErrors.push(`Invalid fee: ${data.fee}`);
          if (fee < 0) validationErrors.push('fee cannot be negative');
        }
        
        // Track error types for summary
        validationErrors.forEach(err => {
          const errorKey = err.split(':')[0];
          validationSummary.errorsByType[errorKey] = (validationSummary.errorsByType[errorKey] || 0) + 1;
        });
        
        const transactionDoc = {
          runId,
          source,
          transactionId: data.transaction_id || null,
          timestamp: (timestamp && !isNaN(timestamp.getTime())) ? timestamp : null,
          type: type,
          asset: data.asset || null,
          normalizedAsset: normalizedAsset,
          quantity: isNaN(quantity) ? null : quantity,
          priceUsd: priceUsd,
          fee: fee,
          note: data.note || '',
          rawData: data,
          validationErrors: validationErrors,
          isValid: validationErrors.length === 0,
          matched: false
        };
        
        if (transactionDoc.isValid) {
          validationSummary.valid++;
        } else {
          validationSummary.invalid++;
        }
        
        results.push(transactionDoc);
      })
      .on('end', async () => {
        // Log detailed summary
        console.log('\n=== CSV Ingestion Summary ===');
        console.log(`Source: ${source}`);
        console.log(`Run ID: ${runId}`);
        console.log(`Total rows: ${validationSummary.total}`);
        console.log(`✅ Valid: ${validationSummary.valid}`);
        console.log(`❌ Invalid: ${validationSummary.invalid}`);
        
        if (validationSummary.duplicateIds.length > 0) {
          console.log(`\n⚠️  Duplicate IDs found in file: ${validationSummary.duplicateIds.join(', ')}`);
        }
        
        if (Object.keys(validationSummary.errorsByType).length > 0) {
          console.log('\n📊 Error breakdown:');
          Object.entries(validationSummary.errorsByType).forEach(([error, count]) => {
            console.log(`  - ${error}: ${count} occurrences`);
          });
        }
        
        // Show sample of invalid transactions
        const invalidTransactions = results.filter(r => !r.isValid).slice(0, 5);
        if (invalidTransactions.length > 0) {
          console.log('\n🔍 Sample of invalid transactions being stored:');
          invalidTransactions.forEach(tx => {
            console.log(`  - ID: ${tx.transactionId || 'MISSING'}, Errors: ${tx.validationErrors.join('; ')}`);
          });
          if (validationSummary.invalid > 5) {
            console.log(`  ... and ${validationSummary.invalid - 5} more invalid transactions`);
          }
        }
        
        // Insert ALL transactions (both valid and invalid)
        if (results.length > 0) {
          try {
            // Optional: Check for duplicates in database to avoid unique constraint errors
            // Only check for valid transactionIds that are not null
            const validTransactionIds = results
              .map(t => t.transactionId)
              .filter(id => id !== null && id !== undefined);
            
            let existingIds = [];
            if (validTransactionIds.length > 0) {
              existingIds = await Transaction.find({
                transactionId: { $in: validTransactionIds },
                source: source,
                runId: { $ne: runId } // Only check from different runs
              }).distinct('transactionId');
            }
            
            // Mark duplicates in the same run as invalid (optional)
            results.forEach(transaction => {
              if (transaction.transactionId && existingIds.includes(transaction.transactionId)) {
                if (transaction.isValid) {
                  transaction.isValid = false;
                  transaction.validationErrors.push('Transaction ID already exists in database from previous run');
                  validationSummary.invalid++;
                  validationSummary.valid--;
                }
              }
            });
            
            // Insert all transactions
            await Transaction.insertMany(results);
            
            console.log(`\n✅ Successfully inserted ${results.length} transactions into database:`);
            console.log(`   - ${validationSummary.valid} valid transactions`);
            console.log(`   - ${validationSummary.invalid} invalid transactions (marked with isValid=false)`);
            
          } catch (dbError) {
            console.error('❌ Database insertion failed:', dbError.message);
            reject(dbError);
            return;
          }
        } else {
          console.log('\n⚠️  No transactions to insert');
        }
        
        console.log('========================\n');
        resolve({
          inserted: results.length,
          total: validationSummary.total,
          valid: validationSummary.valid,
          invalid: validationSummary.invalid,
          duplicateIdsInFile: validationSummary.duplicateIds,
          errorsByType: validationSummary.errorsByType
        });
      })
      .on('error', (error) => {
        console.error('❌ Error reading CSV:', error.message);
        reject(error);
      });
  });
};