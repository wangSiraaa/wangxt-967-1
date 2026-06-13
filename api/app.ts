import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { initDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import batchRoutes from './routes/batches.js';
import registrationRoutes from './routes/registrations.js';
import lotteryRoutes from './routes/lottery.js';
import uploadRoutes from './routes/upload.js';
import appealRoutes from './routes/appeals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const DIST_DIR = path.join(__dirname, '..', 'dist');

app.use('/api/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/appeals', appealRoutes);

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    });
  },
);

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  if (error.message === '仅支持图片文件上传') {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  });
});

export { initDatabase };
export default app;
