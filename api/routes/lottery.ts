import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { run, query, queryOne } from '../database.js';
import { authMiddleware, adminMiddleware, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

router.post('/execute/:batchId', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    if (batch.status === 'published') {
      res.status(400).json({ success: false, error: '已发布的结果不可修改' });
      return;
    }

    const approved = query(
      'SELECT * FROM registrations WHERE batch_id = ? AND status = ?',
      [batchId, 'approved']
    );

    if (approved.length === 0) {
      res.status(400).json({ success: false, error: '该批次没有已审核通过的报名' });
      return;
    }

    let stallNumbers: string[];
    try {
      stallNumbers = JSON.parse(batch.stall_numbers as string);
    } catch {
      stallNumbers = [];
    }

    if (approved.length > stallNumbers.length) {
      res.status(400).json({
        success: false,
        error: `审核通过人数(${approved.length})超过摊位数量(${stallNumbers.length})`,
      });
      return;
    }

    run('DELETE FROM lottery_results WHERE batch_id = ?', [batchId]);

    const shuffled = fisherYatesShuffle(approved);

    for (let i = 0; i < shuffled.length; i++) {
      run(
        'INSERT INTO lottery_results (batch_id, registration_id, stall_number, is_published) VALUES (?, ?, ?, 0)',
        [batchId, shuffled[i].id, stallNumbers[i]]
      );
    }

    run(
      "UPDATE batches SET status = 'lottery_done' WHERE id = ?",
      [batchId]
    );

    const results = query(
      `SELECT lr.*, r.merchant_name, r.contact_person, r.phone, r.category, r.license_no
       FROM lottery_results lr
       LEFT JOIN registrations r ON lr.registration_id = r.id
       WHERE lr.batch_id = ?`,
      [batchId]
    );

    res.json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/results/:batchId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    const authHeader = req.headers.authorization;
    let isAdmin = false;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as { role: string };
        isAdmin = decoded.role === 'admin';
      } catch {
        isAdmin = false;
      }
    }

    if (batch.status !== 'published' && !isAdmin) {
      res.status(403).json({ success: false, error: '该批次抽签结果尚未发布' });
      return;
    }

    const publishedFilter = batch.status === 'published' && !isAdmin ? 'AND lr.is_published = 1' : '';

    const results = query(
      `SELECT lr.*, r.merchant_name, r.contact_person, r.phone, r.category, r.license_no
       FROM lottery_results lr
       LEFT JOIN registrations r ON lr.registration_id = r.id
       WHERE lr.batch_id = ? ${publishedFilter}
       ORDER BY lr.stall_number`,
      [batchId]
    );

    res.json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/results', async (req: Request, res: Response): Promise<void> => {
  try {
    const results = query(
      `SELECT lr.*, r.merchant_name, r.contact_person, r.phone, r.category, r.license_no,
              b.name as batch_name
       FROM lottery_results lr
       LEFT JOIN registrations r ON lr.registration_id = r.id
       LEFT JOIN batches b ON lr.batch_id = b.id
       WHERE lr.is_published = 1
       ORDER BY lr.batch_id, lr.stall_number`
    );

    res.json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/publish/:batchId', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batchId]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    if (batch.status !== 'lottery_done') {
      res.status(400).json({ success: false, error: '批次尚未完成抽签，无法发布' });
      return;
    }

    run('UPDATE lottery_results SET is_published = 1 WHERE batch_id = ?', [batchId]);
    run("UPDATE batches SET status = 'published' WHERE id = ?", [batchId]);

    res.json({ success: true, data: { message: '抽签结果已发布' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
