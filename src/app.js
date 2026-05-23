import express from 'express';
import reconciliationRoutes from './routes/reconcillation.routes.js';

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api',reconciliationRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Reconciliation Engine API is running' });
});

// 3. Application Routes
// TODO: Mount routes here (e.g., app.use('/api', reconciliationRoutes))


export default app;
