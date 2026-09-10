import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { errorHandler, notFound } from './middleware/error.js';
import { migrate } from './db/migrate.js';

import authRoutes from './routes/auth.js';
import transactionRoutes from './routes/transactions.js';
import investmentRoutes from './routes/investments.js';
import assetRoutes from './routes/assets.js';
import budgetRoutes from './routes/budgets.js';
import recurringRoutes from './routes/recurring.js';
import dashboardRoutes from './routes/dashboard.js';
import syncRoutes from './routes/sync.js';
import notificationRoutes from './routes/notifications.js';
import categoryRoutes from './routes/categories.js';
import mailImportRoutes from './routes/mailImport.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'every-rupee-counts', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/mail-import', mailImportRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await migrate();
  } catch (err) {
    console.warn('Migration skipped or failed (is Postgres running?):', err.message);
  }

  app.listen(config.port, () => {
    console.log(`Every Rupee Counts API listening on port ${config.port}`);
  });
}

start();

export default app;
