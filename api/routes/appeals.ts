import { Router, type Request, type Response } from 'express';
import { run, query, queryOne } from '../database.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batch_id, status } = req.query;

    let sql = `SELECT a.*, r.merchant_name, r.category, b.name as batch_name
               FROM appeals a
               LEFT JOIN registrations r ON a.registration_id = r.id
               LEFT JOIN batches b ON a.batch_id = b.id
               WHERE 1=1`;
    const params: unknown[] = [];

    if (batch_id) {
      sql += ' AND a.batch_id = ?';
      params.push(batch_id);
    }
    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    if (req.user?.role !== 'admin') {
      sql += ' AND a.user_id = ?';
      params.push(req.user!.id);
    }

    sql += ' ORDER BY a.created_at DESC';

    const appeals = query(sql, params);
    res.json({ success: true, data: appeals });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const appeal = queryOne(
      `SELECT a.*, r.merchant_name, r.category, b.name as batch_name
       FROM appeals a
       LEFT JOIN registrations r ON a.registration_id = r.id
       LEFT JOIN batches b ON a.batch_id = b.id
       WHERE a.id = ?`,
      [req.params.id]
    );

    if (!appeal) {
      res.status(404).json({ success: false, error: '申诉记录不存在' });
      return;
    }

    if (req.user?.role !== 'admin' && appeal.user_id !== req.user?.id) {
      res.status(403).json({ success: false, error: '无权查看此申诉' });
      return;
    }

    const reviews = query(
      `SELECT ar.*, u.name as reviewer_name
       FROM appeal_reviews ar
       LEFT JOIN users u ON ar.reviewer_id = u.id
       WHERE ar.appeal_id = ?
       ORDER BY ar.created_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: { appeal, reviews } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/reviews', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const appeal = queryOne('SELECT * FROM appeals WHERE id = ?', [req.params.id]);

    if (!appeal) {
      res.status(404).json({ success: false, error: '申诉记录不存在' });
      return;
    }

    if (req.user?.role !== 'admin' && appeal.user_id !== req.user?.id) {
      res.status(403).json({ success: false, error: '无权查看此申诉' });
      return;
    }

    const reviews = query(
      `SELECT ar.*, u.name as reviewer_name
       FROM appeal_reviews ar
       LEFT JOIN users u ON ar.reviewer_id = u.id
       WHERE ar.appeal_id = ?
       ORDER BY ar.created_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: reviews });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { batch_id, registration_id, content, merchant_name, phone } = req.body;

    if (!batch_id || !content?.trim()) {
      res.status(400).json({ success: false, error: '请填写完整的申诉信息' });
      return;
    }

    const batch = queryOne('SELECT * FROM batches WHERE id = ?', [batch_id]);
    if (!batch) {
      res.status(404).json({ success: false, error: '批次不存在' });
      return;
    }

    if (batch.status !== 'published' && batch.status !== 'voided') {
      res.status(400).json({ success: false, error: '该批次尚未公示，无法申诉' });
      return;
    }

    let regId: number | null = null;
    let userId: number | null = null;
    let finalMerchantName = merchant_name;

    if (req.user) {
      userId = req.user.id;
      if (registration_id) {
        const registration = queryOne(
          'SELECT * FROM registrations WHERE id = ? AND batch_id = ?',
          [registration_id, batch_id]
        ) as { id: number; merchant_name: string } | null;
        if (registration) {
          regId = registration.id;
          finalMerchantName = registration.merchant_name;
        }
      }
    } else if (merchant_name && phone) {
      const registration = queryOne(
        'SELECT * FROM registrations WHERE batch_id = ? AND merchant_name = ? AND phone = ?',
        [batch_id, merchant_name, phone]
      ) as { id: number } | null;
      if (registration) {
        regId = registration.id;
      }
    }

    if (!finalMerchantName?.trim()) {
      res.status(400).json({ success: false, error: '请提供商户名称' });
      return;
    }

    if (batch.appeal_deadline) {
      const today = new Date().toISOString().split('T')[0];
      if (today > batch.appeal_deadline) {
        res.status(400).json({ success: false, error: '已超过申诉截止日期' });
        return;
      }
    }

    if (regId && userId) {
      const existingAppeal = queryOne(
        'SELECT id FROM appeals WHERE batch_id = ? AND registration_id = ? AND user_id = ? AND status != ?',
        [batch_id, regId, userId, 'rejected']
      );
      if (existingAppeal) {
        res.status(409).json({ success: false, error: '您已提交过申诉，请等待审核' });
        return;
      }
    }

    run(
      'INSERT INTO appeals (batch_id, registration_id, user_id, merchant_name, phone, content, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [batch_id, regId, userId, finalMerchantName.trim(), phone || null, content.trim(), 'pending']
    );

    const appeal = queryOne('SELECT * FROM appeals ORDER BY id DESC LIMIT 1');
    res.status(201).json({ success: true, data: appeal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id/review', authMiddleware, adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { review_result, correction_note, void_reason } = req.body;

    if (!review_result || !['correction', 'void_batch', 'rejected'].includes(review_result)) {
      res.status(400).json({ success: false, error: '复核结果无效' });
      return;
    }

    const appeal = queryOne('SELECT * FROM appeals WHERE id = ?', [req.params.id]);
    if (!appeal) {
      res.status(404).json({ success: false, error: '申诉记录不存在' });
      return;
    }

    if (appeal.status !== 'pending') {
      res.status(400).json({ success: false, error: '该申诉已处理' });
      return;
    }

    const batchId = appeal.batch_id;

    if (review_result === 'correction') {
      if (!correction_note?.trim()) {
        res.status(400).json({ success: false, error: '请填写更正说明' });
        return;
      }

      run(
        'UPDATE batches SET correction_note = COALESCE(correction_note || \'\n\n\' || ?, ?) WHERE id = ?',
        [correction_note.trim(), correction_note.trim(), batchId]
      );

      run('UPDATE appeals SET status = ? WHERE id = ?', ['reviewed', appeal.id]);

      run(
        'INSERT INTO appeal_reviews (appeal_id, reviewer_id, review_result, correction_note) VALUES (?, ?, ?, ?)',
        [appeal.id, req.user!.id, 'correction', correction_note.trim()]
      );
    } else if (review_result === 'void_batch') {
      if (!correction_note?.trim()) {
        res.status(400).json({ success: false, error: '请填写作废原因' });
        return;
      }

      run(
        "UPDATE batches SET status = 'voided', correction_note = ? WHERE id = ?",
        [correction_note.trim(), batchId]
      );

      run(
        'UPDATE lottery_results SET is_void = 1, void_reason = ? WHERE batch_id = ?',
        [correction_note.trim(), batchId]
      );

      run('UPDATE appeals SET status = ? WHERE id = ?', ['reviewed', appeal.id]);

      run(
        'INSERT INTO appeal_reviews (appeal_id, reviewer_id, review_result, correction_note) VALUES (?, ?, ?, ?)',
        [appeal.id, req.user!.id, 'void_batch', correction_note.trim()]
      );
    } else if (review_result === 'rejected') {
      if (!correction_note?.trim()) {
        res.status(400).json({ success: false, error: '请填写驳回理由' });
        return;
      }

      run('UPDATE appeals SET status = ? WHERE id = ?', ['rejected', appeal.id]);

      run(
        'INSERT INTO appeal_reviews (appeal_id, reviewer_id, review_result, correction_note) VALUES (?, ?, ?, ?)',
        [appeal.id, req.user!.id, 'rejected', correction_note.trim()]
      );
    }

    const updatedAppeal = queryOne('SELECT * FROM appeals WHERE id = ?', [appeal.id]);
    res.json({ success: true, data: updatedAppeal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
