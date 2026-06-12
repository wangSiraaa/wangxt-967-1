import { Router, type Request, type Response } from 'express';
import { run, query, queryOne } from '../database.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const batches = query('SELECT * FROM batches ORDER BY created_at DESC');
    res.json({ success: true, data: batches });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, stall_count, stall_numbers, start_date, end_date } = req.body;

    if (!name || !stall_count || !stall_numbers || !start_date || !end_date) {
      res.status(400).json({ success: false, error: '请填写所有必填字段' });
      return;
    }

    const stallNumbersStr = typeof stall_numbers === 'string' ? stall_numbers : JSON.stringify(stall_numbers);

    run(
      "INSERT INTO batches (name, status, stall_count, stall_numbers, start_date, end_date) VALUES (?, 'open', ?, ?, ?, ?)",
      [name, stall_count, stallNumbersStr, start_date, end_date]
    );

    const batch = queryOne('SELECT * FROM batches ORDER BY id DESC LIMIT 1');

    res.status(201).json({ success: true, data: batch });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [req.params.id]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    const regCount = queryOne(
      'SELECT COUNT(*) as cnt FROM registrations WHERE batch_id = ?',
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...batch,
        registration_count: regCount?.cnt ?? 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = queryOne('SELECT * FROM batches WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    const { name, status, stall_count, stall_numbers, start_date, end_date } = req.body;

    const updatedName = name ?? existing.name;
    const updatedStatus = status ?? existing.status;
    const updatedStallCount = stall_count ?? existing.stall_count;
    const updatedStallNumbers = stall_numbers !== undefined
      ? (typeof stall_numbers === 'string' ? stall_numbers : JSON.stringify(stall_numbers))
      : existing.stall_numbers;
    const updatedStartDate = start_date ?? existing.start_date;
    const updatedEndDate = end_date ?? existing.end_date;

    run(
      'UPDATE batches SET name = ?, status = ?, stall_count = ?, stall_numbers = ?, start_date = ?, end_date = ? WHERE id = ?',
      [updatedName, updatedStatus, updatedStallCount, updatedStallNumbers, updatedStartDate, updatedEndDate, req.params.id]
    );

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: batch });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
