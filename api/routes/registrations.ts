import { Router, type Request, type Response } from 'express';
import { run, query, queryOne } from '../database.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

function normalizeRegistration(r: Record<string, unknown>) {
  return {
    ...r,
    priority_type: (r.priority_type as string) || 'none',
    priority_materials: (r.priority_materials as string) || null,
    priority_review_status: (r.priority_review_status as string) || 'pending',
    priority_review_opinion: (r.priority_review_opinion as string) || null,
    need_adjacent: Number(r.need_adjacent) || 0,
    adjacent_count: Number(r.adjacent_count) || 2,
    adjacent_approved: Number(r.adjacent_approved) || 0,
  };
}

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { batch_id, status } = req.query;

    let sql = 'SELECT r.*, b.name as batch_name FROM registrations r LEFT JOIN batches b ON r.batch_id = b.id WHERE 1=1';
    const params: unknown[] = [];

    if (batch_id) {
      sql += ' AND r.batch_id = ?';
      params.push(batch_id);
    }
    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC';

    const registrations = query(sql, params).map(normalizeRegistration);
    res.json({ success: true, data: registrations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/check-duplicate', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batch_id } = req.query;

    if (!batch_id) {
      res.status(400).json({ success: false, error: '请提供批次ID' });
      return;
    }

    const existing = queryOne(
      'SELECT id, status FROM registrations WHERE batch_id = ? AND user_id = ?',
      [batch_id, req.user!.id]
    );

    res.json({
      success: true,
      data: {
        is_duplicate: !!existing,
        existing_registration: existing || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      batch_id, merchant_name, contact_person, phone, category,
      license_no, license_expiry, license_image,
      food_license_no, food_license_expiry, food_license_image,
      priority_type, priority_materials,
      need_adjacent, adjacent_count,
    } = req.body;

    if (!batch_id || !merchant_name || !contact_person || !phone || !category ||
        !license_no || !license_expiry || !license_image) {
      res.status(400).json({ success: false, error: '请填写所有必填字段' });
      return;
    }

    if (priority_type && !['none', 'disabled', 'veteran', 'old_merchant'].includes(priority_type)) {
      res.status(400).json({ success: false, error: '优先资格类型无效' });
      return;
    }

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batch_id]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    if (batch.status !== 'open') {
      res.status(400).json({ success: false, error: '该批次不在开放报名状态' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (license_expiry < today) {
      res.status(400).json({ success: false, error: '营业执照已过期，无法报名' });
      return;
    }

    if (food_license_expiry && food_license_expiry < today) {
      res.status(400).json({ success: false, error: '食品经营许可证已过期，无法报名' });
      return;
    }

    const existing = queryOne(
      'SELECT id FROM registrations WHERE batch_id = ? AND user_id = ?',
      [batch_id, req.user!.id]
    );
    if (existing) {
      res.status(409).json({ success: false, error: '您已报名该批次，不可重复报名' });
      return;
    }

    const finalPriorityType = priority_type || 'none';
    const finalNeedAdjacent = need_adjacent ? 1 : 0;
    const finalAdjacentCount = finalNeedAdjacent ? (adjacent_count || 2) : 0;

    run(
      `INSERT INTO registrations
        (batch_id, user_id, merchant_name, contact_person, phone, category,
         license_no, license_expiry, license_image,
         food_license_no, food_license_expiry, food_license_image,
         priority_type, priority_materials,
         need_adjacent, adjacent_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        batch_id, req.user!.id, merchant_name, contact_person, phone, category,
        license_no, license_expiry, license_image,
        food_license_no ?? null, food_license_expiry ?? null, food_license_image ?? null,
        finalPriorityType, priority_materials ?? null,
        finalNeedAdjacent, finalAdjacentCount,
      ]
    );

    const registration = queryOne('SELECT * FROM registrations ORDER BY id DESC LIMIT 1');

    res.status(201).json({ success: true, data: registration });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const registration = queryOne(
      'SELECT r.*, b.name as batch_name FROM registrations r LEFT JOIN batches b ON r.batch_id = b.id WHERE r.id = ?',
      [req.params.id]
    );
    if (!registration) {
      res.status(404).json({ success: false, error: '报名记录不存在' });
      return;
    }
    res.json({ success: true, data: normalizeRegistration(registration) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id/status', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, reject_reason, review_opinion } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      res.status(400).json({ success: false, error: '状态必须是 approved 或 rejected' });
      return;
    }

    const existing = queryOne('SELECT * FROM registrations WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: '报名记录不存在' });
      return;
    }

    const now = new Date().toISOString().replace('T', ' ').split('.')[0];

    run(
      'UPDATE registrations SET status = ?, reject_reason = ?, review_opinion = ?, reviewed_at = ? WHERE id = ?',
      [
        status,
        status === 'rejected' ? (reject_reason ?? null) : null,
        review_opinion ?? null,
        now,
        req.params.id,
      ]
    );

    const registration = queryOne('SELECT * FROM registrations WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: normalizeRegistration(registration as Record<string, unknown>) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id/priority-review', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { priority_review_status, priority_review_opinion } = req.body;

    if (!priority_review_status || !['pending', 'approved', 'rejected'].includes(priority_review_status)) {
      res.status(400).json({ success: false, error: '优先资格审核状态无效' });
      return;
    }

    const existing = queryOne('SELECT * FROM registrations WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: '报名记录不存在' });
      return;
    }

    run(
      'UPDATE registrations SET priority_review_status = ?, priority_review_opinion = ? WHERE id = ?',
      [priority_review_status, priority_review_opinion ?? null, req.params.id]
    );

    const registration = queryOne('SELECT * FROM registrations WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: normalizeRegistration(registration as Record<string, unknown>) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
